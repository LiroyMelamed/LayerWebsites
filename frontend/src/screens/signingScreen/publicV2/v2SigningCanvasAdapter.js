import signingPublicApi from '../../../api/signingPublicApi';

const IMAGE_TYPES = new Set(['signature', 'initials', 'lawyerStamp']);
const ok = (data = {}) => ({ success: true, data });

// Adapt package tasks to the incumbent SignatureCanvas. The manifest, OTP and
// acceptance always cover this exact immutable selection, never future tasks.
export function createV2DocumentAdapter({ token, document, task, entries, personName, consentVersion, locale }) {
    const selection = entries || [{ document, task }];
    const finished = selection.every(item => item.task.state === 'accepted');
    const waiting = selection.some(item => !['ready', 'accepted'].includes(item.task.state));
    const fields = selection.flatMap(item => (item.task.fields || []).map(field => ({
        ...field, taskId: item.task.taskId, documentId: item.document.documentId,
    })));
    const bySpot = new Map(fields.map((field, index) => [index + 1, field]));
    const signed = new Set();
    const textValues = new Map();
    const signatureImages = new Map();
    let session = null;
    let sessionPromise = null;
    let accepted = finished;
    let acceptPromise = null;
    let frozenBody = null;
    let mutationPromise = null;
    const idempotencyKey = crypto.randomUUID();

    const spots = () => fields.map((field, index) => ({
        SignatureSpotId: index + 1,
        DocumentId: field.documentId,
        PageNumber: field.pageNum,
        X: field.x, Y: field.y, Width: field.width, Height: field.height,
        FieldType: field.type,
        // Legacy LawyerStamp is already applied by the sender. Package tasks
        // explicitly require the current person's own stamp/drawing instead.
        InteractiveLawyerStamp: field.type === 'lawyerStamp',
        FieldLabel: field.label || '',
        IsRequired: field.required !== false,
        IsSigned: accepted || signed.has(index + 1),
        SignerUserId: 1,
        SignerName: personName || '',
        CanSign: !waiting && !accepted,
        IsMine: true,
        FieldValue: textValues.get(index + 1) ?? '',
        SignatureUrl: signed.has(index + 1) && IMAGE_TYPES.has(field.type) ? signatureImages.get(index + 1) : null,
    }));

    const details = () => ok({
        file: {
            SigningFileId: 1,
            Status: accepted ? 'signed' : 'pending',
            FileName: selection[0].document.name,
            OriginalFileName: selection[0].document.name,
            FileKey: selection[0].document.documentId,
            OtpEnabled: !waiting && !accepted,
            RequireOtp: !waiting && !accepted,
            SigningPolicyVersion: consentVersion,
            ReadOnly: accepted,
            DisableFieldValueCache: true,
        },
        signatureSpots: spots(), signerUserId: 1, signerCompleted: accepted,
        readOnly: accepted, signingOrder: waiting ? 'sequential' : 'parallel',
        isMyTurn: !waiting && !accepted,
    });

    const requiredDone = () => fields.every((field, index) => field.required === false || signed.has(index + 1));

    async function commit() {
        if (accepted || waiting || !session || !requiredDone()) return;
        if (!frozenBody) {
            const values = Object.fromEntries(selection.map(item => [item.task.taskId, {}]));
            textValues.forEach((value, spotId) => {
                const field = bySpot.get(spotId);
                if (!field || field.type === 'date' || IMAGE_TYPES.has(field.type)) return;
                values[field.taskId][field.id] = field.type === 'checkbox'
                    ? value === true || value === 'true'
                    : String(value || '').trim();
            });
            const drawings = new Map();
            signatureImages.forEach((image, spotId) => {
                if (!signed.has(spotId)) return;
                const field = bySpot.get(spotId);
                if (!drawings.has(image)) drawings.set(image, { image, fields: [] });
                drawings.get(image).fields.push({ taskId: field.taskId, fieldId: field.id });
            });
            frozenBody = { consent: true, values, drawings: [...drawings.values()] };
        }
        // A lost response must retry exactly the same payload and idempotency key.
        if (!acceptPromise) {
            acceptPromise = signingPublicApi.accept(token, session.sessionId, frozenBody, idempotencyKey)
                .then(() => { accepted = true; })
                .finally(() => { acceptPromise = null; });
        }
        await acceptPromise;
    }

    function remember(body) {
        if (frozenBody) return; // do not mutate an acceptance whose response was lost
        const spotId = Number(body.signatureSpotId);
        if (!bySpot.has(spotId)) throw new Error('Unknown signing field');
        if (body.signatureImage && IMAGE_TYPES.has(bySpot.get(spotId).type)) signatureImages.set(spotId, body.signatureImage);
        if (body.fieldValue !== undefined) textValues.set(spotId, body.fieldValue);
        signed.add(spotId);
    }

    function applyMarks(mutate) {
        if (mutationPromise) return mutationPromise;
        const before = new Set(signed);
        mutationPromise = (async () => {
            try { mutate(); await commit(); return ok(); }
            catch (error) { signed.clear(); before.forEach(id => signed.add(id)); throw error; }
        })().finally(() => { mutationPromise = null; });
        return mutationPromise;
    }

    return {
        getPublicSigningFileDetails: async () => details(),
        listPublicSavedItems: async () => ok({ signatures: [], stamps: [] }),
        deletePublicSavedItem: async () => ok(),
        getPublicSavedItemDataUrl: async () => ok({ dataUrl: '' }),
        getPublicSavedSignatureDataUrl: async () => ok({ dataUrl: '' }),
        getPublicSavedStampDataUrl: async () => ok({ dataUrl: '' }),
        savePublicSavedSignature: async () => ok(),
        savePublicSavedStamp: async () => ok(),
        publicRequestSigningOtp: async () => {
            if (!sessionPromise) {
                sessionPromise = signingPublicApi.session(token, {
                    taskIds: selection.map(item => item.task.taskId), consentVersion, locale,
                }).then(opened => { session = opened; return opened; })
                    .catch(error => { sessionPromise = null; throw error; });
            }
            const opened = await sessionPromise;
            const sms = (opened.channels || []).find(item => item.channel === 'sms');
            const channel = sms?.channel || opened.channels?.[0]?.channel;
            const sent = await signingPublicApi.challenge(token, opened.sessionId, channel);
            return ok({ channel: sent.channel || channel, delivered: sent.delivery === 'sent' });
        },
        publicVerifySigningOtp: async (_token, otp) => {
            const result = await signingPublicApi.verify(token, session?.sessionId, otp);
            return ok({ verified: result.verified !== false });
        },
        publicSignFile: (_token, body) => applyMarks(() => {
            remember(body);
            // On a retry, restore the last pending field so requiredDone can commit.
            if (frozenBody) signed.add(Number(body.signatureSpotId));
        }),
        publicSignFileBatch: (_token, body) => applyMarks(() => {
            const ids = (body.signatureSpotIds || []).map(Number);
            if (ids.some(id => !IMAGE_TYPES.has(bySpot.get(id)?.type))) throw new Error('Unknown signing field');
            if (!frozenBody && body.signatureImage) ids.forEach(id => signatureImages.set(id, body.signatureImage));
            ids.forEach(id => signed.add(id));
        }),
        // PublicPackageSigning opens the scoped in-page issue dialog. Never
        // pretend a refusal succeeded if an older caller skips that hook.
        publicRejectSigning: async () => { throw new Error('TASK_ISSUE_DIALOG_REQUIRED'); },
    };
}
