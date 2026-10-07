import signingPublicApi from '../../../api/signingPublicApi';

const IMAGE_TYPES = new Set(['signature', 'initials']);
const ok = (data = {}) => ({ success: true, data });

// One package document, presented in the shape the regular signing screen already understands.
export function createV2DocumentAdapter({ token, document, task, personName, consentVersion, locale }) {
    const finished = task.state === 'accepted';
    const waiting = task.state === 'waiting' || task.state === 'blocked';
    const fields = task.fields || [];
    const bySpot = new Map(fields.map((field, index) => [index + 1, field]));
    const signed = new Set();
    const textValues = new Map();
    let signatureImage = null;
    let sessionId = null;
    let accepted = finished;
    const idempotencyKey = crypto.randomUUID();

    const spots = () => fields.map((field, index) => ({
        SignatureSpotId: index + 1,
        PageNumber: field.pageNum,
        X: field.x,
        Y: field.y,
        Width: field.width,
        Height: field.height,
        FieldType: field.type,
        FieldLabel: field.label || '',
        IsRequired: field.required !== false,
        IsSigned: accepted || signed.has(index + 1),
        SignerUserId: 1,
        SignerName: personName || '',
        CanSign: !waiting && !accepted,
        IsMine: true,
        FieldValue: textValues.get(index + 1) || '',
    }));

    const details = () => ok({
        file: {
            SigningFileId: 1,
            Status: accepted ? 'signed' : 'pending',
            FileName: document.name,
            OriginalFileName: document.name,
            FileKey: document.documentId || 'document',
            OtpEnabled: !waiting && !accepted,
            RequireOtp: !waiting && !accepted,
            SigningPolicyVersion: consentVersion,
            ReadOnly: accepted,
        },
        signatureSpots: spots(),
        signerUserId: 1,
        signerCompleted: accepted,
        readOnly: accepted,
        signingOrder: waiting ? 'sequential' : 'parallel',
        isMyTurn: !waiting && !accepted,
    });

    const requiredDone = () => fields.every((field, index) => field.required === false || signed.has(index + 1));

    async function commit() {
        if (accepted || waiting || !sessionId || !requiredDone()) return;
        const values = {};
        textValues.forEach((value, spotId) => {
            const field = bySpot.get(spotId);
            if (!field || field.type === 'date' || IMAGE_TYPES.has(field.type)) return;
            values[field.id] = field.type === 'checkbox' ? value === true : String(value || '').trim();
        });
        const body = { consent: true, values: { [task.taskId]: values } };
        if (signatureImage) body.signature = signatureImage;
        await signingPublicApi.accept(token, sessionId, body, idempotencyKey);
        accepted = true;
    }

    function remember(body) {
        const spotId = Number(body.signatureSpotId);
        if (body.signatureImage) signatureImage = body.signatureImage;
        if (body.fieldValue !== undefined) textValues.set(spotId, body.fieldValue);
        signed.add(spotId);
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
            const opened = await signingPublicApi.session(token, { taskIds: [task.taskId], consentVersion, locale });
            sessionId = opened.sessionId;
            const sms = (opened.channels || []).find(item => item.channel === 'sms');
            const channel = sms?.channel || opened.channels?.[0]?.channel;
            const sent = await signingPublicApi.challenge(token, sessionId, channel);
            return ok({ channel: sent.channel || channel, delivered: sent.delivery !== 'failed' });
        },
        publicVerifySigningOtp: async (_token, otp) => {
            const result = await signingPublicApi.verify(token, sessionId, otp);
            return ok({ verified: result.verified !== false });
        },
        publicSignFile: async (_token, body) => {
            remember(body);
            try { await commit(); }
            catch (error) { signed.delete(Number(body.signatureSpotId)); throw error; }
            return ok();
        },
        publicSignFileBatch: async (_token, body) => {
            if (body.signatureImage) signatureImage = body.signatureImage;
            (body.signatureSpotIds || []).forEach(id => signed.add(Number(id)));
            try { await commit(); }
            catch (error) {
                (body.signatureSpotIds || []).forEach(id => signed.delete(Number(id)));
                throw error;
            }
            return ok();
        },
        publicRejectSigning: async () => ({ success: false, data: { message: '' } }),
    };
}
