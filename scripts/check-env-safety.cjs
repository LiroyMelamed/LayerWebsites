#!/usr/bin/env node
'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const repo = process.argv[2] || process.cwd();
function git(args) { return execFileSync('git', args, { cwd: repo, encoding: 'utf8', timeout: 15000, maxBuffer: 8 * 1024 * 1024 }); }
const names = git(['ls-files', '-z']).split('\0').filter(Boolean);
const errors = [];
const placeholder = value => !value || /^(?:changeme|change[-_ ]?me|replace[-_ ]?me|todo|example|test|dummy|password|secret|local|dev|your[-_ ]|<|\$\{|\$\(|x{4,})/i.test(value) || /\.\.\.$/.test(value) || /change[-_ ]?this|replace[-_ ]?this/i.test(value);
const secretKey = key => /(?:password|passwd|passphrase|(?:^|_)pass$|secret|api_?key|api__?key|access_?token|refresh_?token|auth_?token|(?:^|_)token$|s3_key|private_?key)/i.test(key) && !/(?:ttl|expiration|expires|mode|enabled|length|version|attempts|window)/i.test(key);
for (const file of names) {
  const base = path.posix.basename(file);
  if (base !== '.env' && !base.startsWith('.env.')) continue;
  if (!/^\.env(?:\.[A-Za-z0-9_-]+)*\.(?:example|sample|template)$/.test(base)) {
    errors.push(`${file}: active environment files must remain outside Git`); continue;
  }
  let text;
  try { text = git(['show', `:${file}`]); } catch { errors.push(`${file}: cannot inspect staged content`); continue; }
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{30,}/.test(text)) errors.push(`${file}: authentication material is not allowed in templates`);
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const match = line.match(/^\s*(?:#\s*)?(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const key = match[1]; const quoted = match[2].match(/^(['"])(.*?)\1(?:\s*#.*)?$/); const value = (quoted ? quoted[2] : match[2].replace(/(?:^|\s+)#.*$/, '')).trim();
    if (secretKey(key) && !placeholder(value)) errors.push(`${file}:${index + 1}: ${key} needs an empty value or explicit placeholder`);
    if (/(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16}|eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,})/.test(value)) errors.push(`${file}:${index + 1}: authentication material is not allowed in templates`);
    const url = value.match(/^[A-Za-z][A-Za-z0-9+.-]*:\/\/([^\s@]+)@([^/\s]+)/i);
    if (url) {
      const credentials = url[1]; const password = credentials.includes(':') ? credentials.slice(credentials.indexOf(':') + 1) : '';
      const local = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(url[2]);
      const disposableLocal = local && password === credentials.split(':')[0] && /^[A-Za-z][A-Za-z0-9_-]{0,30}$/.test(password);
      if (password && !placeholder(password) && !disposableLocal) errors.push(`${file}:${index + 1}: remote connection credentials are not allowed in templates`);
    }
  }
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('Environment safety check passed: only templates are tracked and credential checks passed.');
