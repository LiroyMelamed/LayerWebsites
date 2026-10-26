import { useEffect, useRef, useState } from 'react';
import wordTemplatesApi from '../../../api/wordTemplatesApi';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const optionalId = value => value == null || (Number.isSafeInteger(value) && value > 0 && value <= 2147483647);

export default function useWordPreviewImport({ previewId, onLoaded, api = wordTemplatesApi }) {
    const [state, setState] = useState({ id: null, status: 'idle' });
    const [attempt, setAttempt] = useState(0);
    const loaded = useRef(onLoaded);
    loaded.current = onLoaded;
    useEffect(() => {
        if (!previewId) { setState({ id: null, status: 'idle' }); return; }
        let cancelled = false;
        setState({ id: previewId, status: 'loading' });
        (async () => {
            try {
                if (typeof previewId !== 'string' || !UUID.test(previewId)) throw new Error('Invalid preview');
                const { preview } = await api.previewInfo(previewId);
                if (cancelled) return;
                if (preview?.id !== previewId || preview.requiresFreshSigningGeometry !== true
                    || !/^[a-f0-9]{64}$/i.test(preview.pdfHash || '') || !optionalId(preview.caseId)
                    || !optionalId(preview.clientId)) throw new Error('Invalid preview');
                const blob = await api.pdf(previewId);
                if (cancelled) return;
                if (!(blob instanceof Blob) || blob.size < 5 || blob.size > 20 * 1024 * 1024
                    || (blob.type && blob.type !== 'application/pdf')) throw new Error('Invalid PDF');
                const name = String(preview.name || 'document').replace(/[\\/\u0000-\u001f]/g, ' ')
                    .replace(/\.(docx|pdf)$/i, '').trim().slice(0, 180) || 'document';
                const file = new File([blob], `${name}.pdf`, { type: 'application/pdf' });
                loaded.current(file, preview);
                setState({ id: previewId, status: 'ready' });
            } catch {
                if (!cancelled) setState({ id: previewId, status: 'error' });
            }
        })();
        return () => { cancelled = true; };
    }, [previewId, api, attempt]);
    return { status: previewId && state.id !== previewId ? 'loading' : state.status,
        retry: () => setAttempt(value => value + 1) };
}
