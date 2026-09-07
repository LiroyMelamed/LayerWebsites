/**
 * Cursor Composer LLM — same credentials as MelaMotion (CURSOR_API_KEY + CURSOR_MODEL).
 * Uses @cursor/sdk no-repo cloud agent for short text generation.
 */

const DEFAULT_MODEL = 'composer-2.5';
const DEFAULT_TIMEOUT_MS = 90_000;

function getCursorApiKey() {
    return String(process.env.CURSOR_API_KEY || '').trim();
}

function getCursorModel() {
    return String(process.env.CURSOR_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
}

function messagesToPrompt(messages = []) {
    return messages
        .map((msg) => {
            const role = String(msg?.role || 'user').toLowerCase();
            const content = String(msg?.content || '').trim();
            if (!content) return '';
            if (role === 'system') return `System instructions:\n${content}`;
            if (role === 'assistant') return `Assistant:\n${content}`;
            return `User:\n${content}`;
        })
        .filter(Boolean)
        .join('\n\n');
}

async function callCursorLlm(messages, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    const apiKey = getCursorApiKey();
    if (!apiKey) return null;

    const prompt = messagesToPrompt(messages);
    if (!prompt) return null;

    const modelId = getCursorModel();

    let Agent;
    try {
        ({ Agent } = await import('@cursor/sdk'));
    } catch (err) {
        console.warn('[cursorLlm] @cursor/sdk unavailable:', err?.message || err);
        return null;
    }

    const runPrompt = Agent.prompt(prompt, {
        apiKey,
        model: { id: modelId },
        cloud: { repos: [] },
    });

    let timeoutId;
    try {
        const result = await Promise.race([
            runPrompt,
            new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error('Cursor LLM timeout')), timeoutMs);
            }),
        ]);

        if (!result || result.status === 'error') {
            console.warn('[cursorLlm] agent run failed:', result?.error?.message || result?.status);
            return null;
        }

        const text = typeof result.result === 'string' ? result.result.trim() : '';
        return text || null;
    } catch (err) {
        console.warn('[cursorLlm] call failed:', err?.message || err);
        return null;
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

function isCursorLlmConfigured() {
    return Boolean(getCursorApiKey());
}

module.exports = {
    callCursorLlm,
    isCursorLlmConfigured,
    messagesToPrompt,
};
