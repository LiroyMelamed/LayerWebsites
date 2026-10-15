const { assertSigningFileOfficeAccess, assertSigningUploadReferences } = require('../lib/firmPermissions/signingAccess');

function actionFromMethod(req) {
    if (req.method === 'GET' || req.method === 'HEAD') return 'view';
    if (req.path.endsWith('/upload') || req.originalUrl.includes('/upload')) return 'upload';
    return 'manage';
}

module.exports = async function requireSigningOfficeAccess(req, res, next) {
    if (req.firmPermissionMode !== 'role') {
        return next();
    }
    if ((req.path || '').endsWith('/upload')) {
        try {
            const error = await assertSigningUploadReferences(req);
            return next(error || undefined);
        } catch (error) { return next(error); }
    }
    const signingFileId = Number(req.params?.signingFileId);
    if (!Number.isFinite(signingFileId) || signingFileId <= 0) {
        return next();
    }
    try {
        const err = await assertSigningFileOfficeAccess(req, signingFileId, actionFromMethod(req));
        if (err) return next(err);
        return next();
    } catch (e) {
        return next(e);
    }
};
