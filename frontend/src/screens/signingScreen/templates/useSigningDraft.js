import { useCallback, useEffect, useRef, useState } from 'react';
import { newKey } from './ParticipantActionDialog';

const uuid = /^[a-f0-9-]{36}$/i;
const urlId = () => { const value = new URL(window.location.href).searchParams.get('draft'); return uuid.test(value || '') ? value : null; };
function remember(id) {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('draft', id); else url.searchParams.delete('draft');
    window.history.replaceState(window.history.state, '', url);
}

// Serialize/coalesce saves. No contact data or form values enter localStorage.
// The only recovery pointer in the URL is a UUID checked against the owner by API.
export default function useSigningDraft({ api, payload, active, onRestore, onSubmitted }) {
    const enabled = !!(api.draft && api.saveDraft && api.submitDraft);
    const [status, setStatus] = useState(enabled && urlId() ? 'loading' : 'idle');
    const [error, setError] = useState(null);
    const [savedAt, setSavedAt] = useState(null);
    const model = useRef({ id: null, version: 0, saved: null, queue: Promise.resolve(), epoch: 0, loading: enabled && !!urlId(), submitted: false });
    const callbacks = useRef({ onRestore, onSubmitted }); callbacks.current = { onRestore, onSubmitted };
    const serialized = payload ? JSON.stringify(payload) : null;
    const current = useRef(serialized); current.current = serialized;
    const alive = useRef(true);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

    const recover = useCallback(async id => {
        const state = model.current;
        const epoch = ++state.epoch;
        state.loading = true; setStatus('loading'); setError(null);
        try {
            const draft = await api.draft(id);
            if (!alive.current || epoch !== model.current.epoch) return;
            Object.assign(state, { id: draft.id, version: draft.version, saved: JSON.stringify(draft.payload), submitted: draft.state === 'submitted' });
            remember(draft.id); setSavedAt(draft.updatedAt);
            if (draft.state === 'submitted') { callbacks.current.onSubmitted(draft.result); setStatus('submitted'); }
            else {
                await callbacks.current.onRestore(draft.payload, () => alive.current && epoch === model.current.epoch);
                if (!alive.current || epoch !== model.current.epoch) return;
                setStatus('saved');
            }
            state.loading = false;
        } catch (failure) {
            if (alive.current && epoch === model.current.epoch) { setError(failure); setStatus('loadError'); }
        }
    }, [api]);
    const initiallyRecovered = useRef(false);
    useEffect(() => {
        if (!enabled || initiallyRecovered.current) return;
        initiallyRecovered.current = true;
        const id = urlId(); if (id) recover(id);
    }, [enabled, recover]);

    const flush = useCallback(async forcedPayload => {
        if (!enabled) return null;
        const state = model.current, epoch = state.epoch;
        const target = forcedPayload ? JSON.stringify(forcedPayload) : current.current;
        if (state.loading || state.submitted || !target) return null;
        const save = async () => {
            if (epoch !== model.current.epoch || state.submitted) return null;
            if (state.saved === target) return { id: state.id, version: state.version };
            if (alive.current) { setStatus('saving'); setError(null); }
            try {
                if (!state.id) state.id = newKey();
                const draft = await api.saveDraft(state.id, { expectedVersion: state.version, payload: JSON.parse(target) });
                if (epoch !== model.current.epoch) return null;
                Object.assign(state, { version: draft.version, saved: target });
                if (alive.current) { remember(state.id); setSavedAt(draft.updatedAt); setStatus(current.current === target ? 'saved' : 'pending'); }
                return { id: state.id, version: state.version };
            } catch (failure) {
                if (alive.current && epoch === model.current.epoch) { setError(failure); setStatus('error'); }
                throw failure;
            }
        };
        const attempt = state.queue.then(save, save);
        state.queue = attempt.catch(() => {});
        return attempt;
    }, [api, enabled]);

    useEffect(() => {
        if (!enabled || !active || !serialized || model.current.loading || model.current.submitted || model.current.saved === serialized) return;
        setStatus('pending');
        const timer = setTimeout(() => { flush().catch(() => {}); }, 700);
        return () => clearTimeout(timer);
    }, [enabled, active, serialized, flush]);
    useEffect(() => {
        if (!enabled) return;
        const beforeUnload = event => {
            if (!model.current.submitted && current.current && current.current !== model.current.saved) { event.preventDefault(); event.returnValue = ''; }
        };
        window.addEventListener('beforeunload', beforeUnload);
        return () => window.removeEventListener('beforeunload', beforeUnload);
    }, [enabled]);

    const submit = useCallback(async (approvedPayload, previewHash) => {
        const saved = await flush(approvedPayload);
        if (!saved) throw Object.assign(new Error('DRAFT_UNAVAILABLE'), { code: 'DRAFT_UNAVAILABLE' });
        // Save + submit revision are pinned together; an update from another tab
        // produces412, rather than sending an unseen set of recipients.
        const draft = await api.submitDraft(saved.id, { expectedVersion: saved.version, previewHash });
        model.current.submitted = true; setStatus('submitted');
        return draft.result;
    }, [api, flush]);
    const reset = useCallback(() => {
        const epoch = model.current.epoch + 1;
        model.current = { id: null, version: 0, saved: null, queue: Promise.resolve(), epoch, loading: false, submitted: false };
        remember(null); setStatus('idle'); setError(null); setSavedAt(null);
    }, []);
    return { enabled, status, error, savedAt, flush, submit, recover, reset, id: model.current.id || urlId() };
}
