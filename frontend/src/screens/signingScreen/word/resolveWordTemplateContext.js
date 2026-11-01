const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HASH = /^[a-f0-9]{64}$/i;
const validId = value => Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
const contextError = () => Object.assign(new Error('WORD_CONTEXT_CHANGED'), { code: 'WORD_CONTEXT_CHANGED' });
export const wordTemplateOrigin = template => template?.origin || template?.definition?.origin;
export const isWordTemplate = template => wordTemplateOrigin(template)?.kind === 'word_preview';

// This is reference recovery, never recipient or signing-authority inference.
// Only the private preview endpoint can recover the context used to fill a PDF.
export default async function resolveWordTemplateContext(api, template, caller = {}, additionalCaller = {}) {
    if (!isWordTemplate(template)) return null;
    const origin = wordTemplateOrigin(template);
    if (!UUID.test(origin.previewId || '') || !UUID.test(origin.sourceId || '') || !HASH.test(origin.pdfHash || '')
        || !Number.isSafeInteger(origin.sourceVersion) || origin.sourceVersion < 1 || typeof api.wordPreviewInfo !== 'function') throw contextError();
    const { preview } = await api.wordPreviewInfo(origin.previewId);
    if (!preview || preview.id !== origin.previewId || preview.sourceId !== origin.sourceId
        || preview.sourceVersion !== origin.sourceVersion || preview.pdfHash !== origin.pdfHash
        || ![preview.clientId, preview.caseId].every(id => id == null || validId(id))) throw contextError();
    const ids = {};
    for (const key of ['clientId', 'caseId']) {
        const choices = [caller[key], additionalCaller[key]].filter(id => id != null && id !== '').map(Number);
        if (choices.some(id => !validId(id)) || new Set(choices).size > 1
            || (preview[key] != null && choices.some(id => preview[key] !== id))) throw contextError();
        const explicit = choices[0] ?? null;
        // A null original association remains unlocked. An explicit caller may
        // keep its own association, but document roles/recipients never supply it.
        ids[key] = preview[key] ?? explicit;
    }
    const [client, caseRecord] = await Promise.all([
        ids.clientId == null ? null : api.clientContext(ids.clientId),
        ids.caseId == null ? null : api.caseContext(ids.caseId),
    ]);
    if ((ids.clientId != null && Number(client?.id) !== ids.clientId) || (ids.caseId != null && Number(caseRecord?.id) !== ids.caseId)) throw contextError();
    return { clientContext: client ? { ...client, id: ids.clientId } : null,
        caseContext: caseRecord ? { ...caseRecord, id: ids.caseId } : null,
        lockedClientId: preview.clientId ?? null, lockedCaseId: preview.caseId ?? null };
}
