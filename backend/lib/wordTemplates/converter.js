'use strict';

const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const { importDocx } = require('./index');
const { WordTemplateError } = require('./errors');

const LIMITS = Object.freeze({ timeoutMs: 120000, maxOutputBytes: 50 * 1024 * 1024, maxPages: 200, concurrent: 2 });
const DEFAULTS = Object.freeze({ timeoutMs: 60000, maxOutputBytes: 20 * 1024 * 1024, maxPages: 200 });
const KILL_GRACE_MS = 200;
let activeConversions = 0;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const error = code => new WordTemplateError(code);

function integerOption(value, fallback, min, max) {
    const result = value === undefined ? fallback : value;
    if (!Number.isSafeInteger(result) || result < min || result > max) throw error('WORD_CONVERSION_INVALID_CONFIG');
    return result;
}

async function configuration(options) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) throw error('WORD_CONVERSION_INVALID_CONFIG');
    const executablePath = options.executablePath ?? process.env.WORD_TEMPLATE_SOFFICE_PATH;
    if (!executablePath) throw error('WORD_CONVERSION_NOT_CONFIGURED');
    if (typeof executablePath !== 'string' || !path.isAbsolute(executablePath) || executablePath.includes('\0')
        || process.platform === 'win32') throw error('WORD_CONVERSION_INVALID_CONFIG');
    if (options.signal !== undefined && (!options.signal || typeof options.signal.aborted !== 'boolean'
        || typeof options.signal.addEventListener !== 'function' || typeof options.signal.removeEventListener !== 'function')) {
        throw error('WORD_CONVERSION_INVALID_CONFIG');
    }
    const result = {
        timeoutMs: integerOption(options.timeoutMs, DEFAULTS.timeoutMs, 100, LIMITS.timeoutMs),
        maxOutputBytes: integerOption(options.maxOutputBytes, DEFAULTS.maxOutputBytes, 16, LIMITS.maxOutputBytes),
        maxPages: integerOption(options.maxPages, DEFAULTS.maxPages, 1, LIMITS.maxPages),
        signal: options.signal,
    };
    try {
        result.executablePath = await fs.realpath(executablePath);
        if (!(await fs.stat(result.executablePath)).isFile()) throw error('WORD_CONVERSION_EXECUTABLE_UNAVAILABLE');
        await fs.access(result.executablePath, constants.X_OK);
        const tempRoot = options.tempRoot ?? os.tmpdir();
        if (typeof tempRoot !== 'string' || !path.isAbsolute(tempRoot) || tempRoot.includes('\0')) throw error('WORD_CONVERSION_INVALID_CONFIG');
        result.tempRoot = await fs.realpath(tempRoot);
        if (!(await fs.stat(result.tempRoot)).isDirectory()) throw error('WORD_CONVERSION_INVALID_CONFIG');
    } catch (caught) {
        if (caught instanceof WordTemplateError) throw caught;
        throw error('WORD_CONVERSION_EXECUTABLE_UNAVAILABLE');
    }
    return result;
}

function killOwnedGroup(child, signal) {
    if (!child?.pid) return;
    // A detached POSIX child owns this process group; never target a shared
    // LibreOffice process/profile or discover processes by executable name.
    try { process.kill(-child.pid, signal); }
    catch (caught) { if (caught.code !== 'ESRCH') throw error('WORD_CONVERSION_PROCESS_CLEANUP_FAILED'); }
}

async function runProcess(config, directory, outputPath) {
    const profile = path.join(directory, 'profile');
    const outputDirectory = path.join(directory, 'output');
    const args = [
        `-env:UserInstallation=${pathToFileURL(profile).href}`, '--headless', '--invisible', '--nologo',
        '--nodefault', '--norestore', '--nofirststartwizard', '--convert-to', 'pdf:writer_pdf_Export',
        '--outdir', outputDirectory, path.join(directory, 'source.docx'),
    ];
    const env = {
        PATH: '/usr/bin:/bin', HOME: path.join(directory, 'home'), TMPDIR: path.join(directory, 'tmp'),
        XDG_CACHE_HOME: path.join(directory, 'cache'), XDG_CONFIG_HOME: path.join(directory, 'config'),
        XDG_DATA_HOME: path.join(directory, 'data'), LANG: 'C.UTF-8', SAL_USE_VCLPLUGIN: 'svp', GSETTINGS_BACKEND: 'memory',
    };
    return new Promise((resolve, reject) => {
        let child;
        let reason;
        let checking = false;
        let ended = false;
        let killTimer;
        const stop = code => {
            if (ended || reason) return;
            reason = error(code);
            try { killOwnedGroup(child, 'SIGTERM'); } catch (caught) { reason = caught; }
            killTimer = setTimeout(() => {
                try { killOwnedGroup(child, 'SIGKILL'); } catch (caught) { reason = caught; }
            }, KILL_GRACE_MS);
        };
        const abort = () => stop('WORD_CONVERSION_ABORTED');
        const timeout = setTimeout(() => stop('WORD_CONVERSION_TIMEOUT'), config.timeoutMs);
        const monitor = setInterval(async () => {
            if (checking || ended) return;
            checking = true;
            try {
                const stats = await fs.lstat(outputPath);
                if (!stats.isFile() || stats.isSymbolicLink()) stop('WORD_CONVERSION_INVALID_OUTPUT');
                else if (stats.size > config.maxOutputBytes) stop('WORD_CONVERSION_OUTPUT_LIMIT');
            } catch (caught) { if (caught.code !== 'ENOENT') stop('WORD_CONVERSION_INVALID_OUTPUT'); }
            finally { checking = false; }
        }, 50);
        const finish = async (code, failedToStart = false) => {
            if (ended) return;
            ended = true;
            clearTimeout(timeout); clearInterval(monitor); clearTimeout(killTimer);
            config.signal?.removeEventListener('abort', abort);
            // Also reap descendants that outlive a successfully exited wrapper.
            // This group belongs to this invocation even when its leader exited.
            try { killOwnedGroup(child, 'SIGKILL'); } catch (caught) { reason = caught; }
            if (reason) reject(reason);
            else if (failedToStart) reject(error('WORD_CONVERSION_START_FAILED'));
            else if (code !== 0) reject(error('WORD_CONVERSION_FAILED'));
            else resolve();
        };
        try {
            child = spawn(config.executablePath, args, { cwd: directory, env, shell: false, detached: true,
                stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true });
            child.once('error', () => finish(null, true));
            child.once('close', code => finish(code));
            config.signal?.addEventListener('abort', abort, { once: true });
            if (config.signal?.aborted) abort();
        } catch (_) { finish(null, true); }
    });
}

async function validatePdf(outputPath, config) {
    let handle;
    try {
        const stat = await fs.lstat(outputPath);
        if (!stat.isFile() || stat.isSymbolicLink()) throw error('WORD_CONVERSION_INVALID_OUTPUT');
        if (stat.size > config.maxOutputBytes) throw error('WORD_CONVERSION_OUTPUT_LIMIT');
        if (stat.size < 16) throw error('WORD_CONVERSION_INVALID_PDF');
        handle = await fs.open(outputPath, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
        const opened = await handle.stat();
        if (!opened.isFile() || opened.ino !== stat.ino || opened.dev !== stat.dev || opened.size !== stat.size) {
            throw error('WORD_CONVERSION_INVALID_OUTPUT');
        }
        const buffer = await handle.readFile();
        if (buffer.length > config.maxOutputBytes) throw error('WORD_CONVERSION_OUTPUT_LIMIT');
        if (buffer.length !== stat.size || !/^%PDF-1\.[0-9](?:\r|\n|\s)/u.test(buffer.subarray(0, 16).toString('latin1'))
            || !/%%EOF\s*$/u.test(buffer.subarray(-1024).toString('latin1'))) throw error('WORD_CONVERSION_INVALID_PDF');
        // Lazy import avoids loading the PDF parser for configuration/invalid
        // input errors. Neither this path nor the converter fetches remote URLs.
        const { PDFDocument } = require('pdf-lib');
        try {
            const pdf = await PDFDocument.load(buffer, { updateMetadata: false, ignoreEncryption: false, throwOnInvalidObject: true });
            const pageCount = pdf.getPageCount();
            if (pageCount < 1 || pageCount > config.maxPages) throw error('WORD_CONVERSION_PAGE_LIMIT');
            for (const page of pdf.getPages()) {
                const { width, height } = page.getSize();
                if (![width, height].every(n => Number.isFinite(n) && n > 0 && n <= 14400)) throw error('WORD_CONVERSION_INVALID_PDF');
            }
            return { buffer, pageCount };
        } catch (caught) {
            if (caught instanceof WordTemplateError) throw caught;
            throw error('WORD_CONVERSION_INVALID_PDF');
        }
    } catch (caught) {
        if (caught instanceof WordTemplateError) throw caught;
        throw error('WORD_CONVERSION_INVALID_OUTPUT');
    } finally { if (handle) await handle.close(); }
}

/**
 * Local-only, bounded DOCX -> PDF conversion. Deployment must explicitly supply
 * its managed soffice executable (option or WORD_TEMPLATE_SOFFICE_PATH); no
 * desktop/bundled executable is discovered. POSIX only, two active jobs/worker.
 * A dedicated restricted worker and egress policy remain deployment concerns;
 * subprocess isolation here is not an OS/network sandbox.
 *
 * Returned bytes are privately retained; each `buffer` access returns a copy.
 * Every converted PDF needs newly resolved/reviewed signing geometry.
 */
async function convertDocxToPdf(input, options = {}) {
    // Own a stable snapshot before any await/process can observe caller edits.
    if (!Buffer.isBuffer(input) || input.length > 20 * 1024 * 1024) throw error('WORD_CONVERSION_INVALID_DOCX');
    const source = Buffer.from(input);
    const config = await configuration(options);
    if (config.signal?.aborted) throw error('WORD_CONVERSION_ABORTED');
    let sourceHash;
    try { sourceHash = importDocx(source).sourceHash; }
    catch (_) { throw error('WORD_CONVERSION_INVALID_DOCX'); }
    if (activeConversions >= LIMITS.concurrent) throw error('WORD_CONVERSION_BUSY');
    activeConversions += 1;
    let directory;
    let result;
    let failure;
    try {
        directory = await fs.mkdtemp(path.join(config.tempRoot, 'legal-word-convert-'));
        await fs.chmod(directory, 0o700);
        await Promise.all(['profile', 'output', 'home', 'tmp', 'cache', 'config', 'data']
            .map(name => fs.mkdir(path.join(directory, name), { mode: 0o700 })));
        await fs.writeFile(path.join(directory, 'source.docx'), source, { mode: 0o600, flag: 'wx' });
        const outputPath = path.join(directory, 'output', 'source.pdf');
        await runProcess(config, directory, outputPath);
        if (config.signal?.aborted) throw error('WORD_CONVERSION_ABORTED');
        const { buffer, pageCount } = await validatePdf(outputPath, config);
        const outputHash = hash(buffer);
        result = Object.freeze({ get buffer() { return Buffer.from(buffer); }, sourceHash, outputHash, pageCount,
            format: 'pdf', converter: 'libreoffice', requiresFreshSigningGeometry: true });
    } catch (caught) { failure = caught instanceof WordTemplateError ? caught : error('WORD_CONVERSION_FAILED'); }
    finally {
        if (directory) {
            try { await fs.rm(directory, { recursive: true, force: true, maxRetries: 2, retryDelay: 50 }); }
            catch (_) { failure = error('WORD_CONVERSION_CLEANUP_FAILED'); }
        }
        activeConversions -= 1;
    }
    if (failure) throw failure;
    return result;
}

module.exports = { convertDocxToPdf, LIMITS, DEFAULTS };
