import apiUtils from './apiUtils';
import signingFilesApi from './signingFilesApi';

// Bound only portal requests; incumbent callers retain their existing defaults.
export const CLIENT_PORTAL_REQUEST_OPTIONS = Object.freeze({ timeout: 15000 });

async function collect(requests) {
    const settled = await Promise.all(requests.map(async ([source, request, normalize]) => {
        try {
            const response = await request();
            if (response?.status !== 200 || response?.success === false) throw new Error('load');
            return { files: normalize(response.data), source };
        } catch {
            return { files: [], source, failed: true };
        }
    }));
    return { status: 200, success: true, data: {
        files: settled.flatMap(result => result.files),
        errors: settled.filter(result => result.failed).map(result => result.source),
    } };
}

const signingSources = () => [
    ['signing', () => signingFilesApi.getClientSigningFiles(CLIENT_PORTAL_REQUEST_OPTIONS), data => {
        if (!Array.isArray(data?.files)) throw new Error('shape');
        return data.files.map(file => ({ ...file, PortalId: `signing:${file.SigningFileId}`, Source: 'signing' }));
    }],
    ['packages', () => apiUtils.get('signing-v2/client/documents', CLIENT_PORTAL_REQUEST_OPTIONS), data => {
        if (!Array.isArray(data?.documents)) throw new Error('shape');
        return data.documents.map(file => ({ ...file, PortalId: `package:${file.DocumentId}`, Source: 'package' }));
    }],
];

const clientPortalApi = {
    getSigningDocuments: () => collect(signingSources()),
    getDocuments: () => collect([...signingSources(),
        ['caseFiles', () => apiUtils.get('files/client-files', CLIENT_PORTAL_REQUEST_OPTIONS), data => {
            if (!Array.isArray(data)) throw new Error('shape');
            return data.map(file => ({
                ...file, PortalId: `case:${file.id}`, Source: 'case', FileName: file.file_name,
                CaseId: file.caseid, CreatedAt: file.created_at, PersonalStatus: 'view_only', CanDownload: true,
            }));
        }],
    ]),
    openPackageDocument: file => apiUtils.post(`signing-v2/client/documents/${encodeURIComponent(file.DocumentId)}/open`, { grantId: file.GrantId }, CLIENT_PORTAL_REQUEST_OPTIONS),
};

export default clientPortalApi;
