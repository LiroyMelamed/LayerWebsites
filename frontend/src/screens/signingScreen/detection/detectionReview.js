export function resolveSpotSignerIndex(signers, spot) {
    if (spot?.assignmentStatus === 'unassigned') return null;
    const list = Array.isArray(signers) ? signers : [];
    const uid = spot?.signerUserId ?? spot?.SignerUserId;
    if (uid !== null && uid !== undefined && uid !== '') {
        const index = list.findIndex(s => Number(s?.UserId ?? s?.userId) === Number(uid));
        return index >= 0 ? index : null;
    }
    const name = String(spot?.signerName ?? spot?.SignerName ?? '').trim();
    const matching = name ? list.map((s, i) => String(s?.Name ?? s?.name ?? '').trim() === name ? i : -1).filter(i => i >= 0) : [];
    if (matching.length === 1) return matching[0];
    const raw = spot?.signerIndex ?? spot?.SignerIndex;
    if (raw === null || raw === undefined || raw === '') return null;
    const index = Number(raw);
    return Number.isInteger(index) && index >= 0 && index < list.length ? index : null;
}

export function validDetectedSpot(spot) {
    return Number.isInteger(Number(spot?.pageNum)) && Number(spot.pageNum) > 0
        && ['x', 'y', 'width', 'height'].every(key => spot[key] !== null && spot[key] !== '' && Number.isFinite(Number(spot[key])))
        && Number(spot.x) >= 0 && Number(spot.y) >= 0 && Number(spot.width) > 0 && Number(spot.height) > 0;
}

function sameLocation(a, b) {
    if (Number(a.pageNum ?? a.PageNumber) !== Number(b.pageNum)) return false;
    const ax = Number(a.x ?? a.X), ay = Number(a.y ?? a.Y);
    const aw = Number(a.width ?? a.Width), ah = Number(a.height ?? a.Height);
    const bx = Number(b.x), by = Number(b.y), bw = Number(b.width), bh = Number(b.height);
    if (![ax, ay, aw, ah].every(Number.isFinite)) return false;
    const overlap = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx))
        * Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by));
    return overlap / Math.min(aw * ah, bw * bh) >= 0.65;
}

// Existing fields always win, including manual fields edited while detection ran.
export function mergeDetectedSpots(existing, incoming) {
    const merged = [...existing];
    for (const spot of incoming) {
        if (validDetectedSpot(spot) && !merged.some(prior => sameLocation(prior, spot))) {
            merged.push({ ...spot, type: 'signature', assignmentStatus: 'reviewed' });
        }
    }
    return merged;
}

export function signerFingerprint(signers = []) {
    return JSON.stringify(signers.map(s => [s.UserId ?? s.userId, s.Name ?? s.name]));
}

export async function uploadCurrentSigningFile({ file, fileKey, currentFile, uploadFile, onFileKey }) {
    const assertCurrent = () => {
        if (!file || currentFile() !== file) {
            const error = new Error('Signing input changed');
            error.code = 'STALE_SIGNING_INPUT';
            throw error;
        }
    };
    assertCurrent();
    if (fileKey) return fileKey;
    const result = await uploadFile(file);
    assertCurrent();
    const key = result?.key ?? result?.data?.key;
    if (!key) throw new Error('Missing uploaded file key');
    onFileKey(key);
    return key;
}
