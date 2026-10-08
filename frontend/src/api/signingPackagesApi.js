import { signingRequest } from './signingTemplatesApi';

const root = 'signing-v2';
function query(params = {}) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') search.set(key, String(value));
    });
    return search.toString();
}
const participant = (packageId, personId) => `${root}/packages/${packageId}/participants/${personId}`;

const signingPackagesApi = {
    matchingPackages: (filters, config) => signingRequest('get', `${root}/packages?${query(filters)}`, null, config),
    freezeSelection: (body, key, config) => signingRequest('post', `${root}/selections`, body, { ...config, headers: { 'Idempotency-Key': key } }),
    previewBulk: (id, body, key, config) => signingRequest('post', `${root}/selections/${id}/preview`, body, { ...config, headers: { 'Idempotency-Key': key } }),
    executeBulk: (body, key) => signingRequest('post', `${root}/bulk-actions`, body, { headers: { 'Idempotency-Key': key } }),
    bulkOperation: (id, config) => signingRequest('get', `${root}/bulk-actions/${id}`, null, config),
    bulkOperations: config => signingRequest('get', `${root}/bulk-actions`, null, config),
    list: (filters, config) => signingRequest('get', `${root}/submissions?${query(filters)}`, null, config),
    packages: (id, filters, config) => signingRequest('get', `${root}/submissions/${id}/packages?${query(filters)}`, null, config),
    details: (id, config) => signingRequest('get', `${root}/packages/${id}`, null, config),
    documentFile: (packageId, documentId, config) => signingRequest('get', `${root}/packages/${packageId}/documents/${documentId}`, null, { responseType: 'blob', ...config }),
    evidenceFile: (packageId, config) => signingRequest('get', `${root}/packages/${packageId}/evidence`, null, { responseType: 'blob', ...config }),
    previewAction: (packageId, personId, body, config) => signingRequest('post', `${participant(packageId, personId)}/action-preview`, body, config),
    executeAction: (packageId, personId, body, idempotencyKey) => signingRequest('post', `${participant(packageId, personId)}/actions`, body,
        { headers: { 'Idempotency-Key': idempotencyKey } }),
    resolveIssue: (packageId, issueId, body, idempotencyKey) => signingRequest('post', `${root}/packages/${packageId}/issues/${issueId}/resolve`, body, { headers: { 'Idempotency-Key': idempotencyKey } }),
    operation: (id, config) => signingRequest('get', `${root}/operations/${id}`, null, config),
    templates: config => signingRequest('get', `${root}/templates`, null, config),
    authoringTemplates: ({ archived = false } = {}) => signingRequest('get', `${root}/authoring/templates?archived=${archived}`),
    archiveTemplate: (id, body) => signingRequest('post', `${root}/authoring/templates/${encodeURIComponent(id)}/archive`, body),
    templateVersion: id => signingRequest('get', `${root}/authoring/versions/${encodeURIComponent(id)}`),
    saveTemplateDraft: (id, body) => signingRequest('put', `${root}/authoring/drafts/${encodeURIComponent(id)}`, body),
    publishTemplateDraft: (id, body) => signingRequest('post', `${root}/authoring/drafts/${encodeURIComponent(id)}/publish`, body),
    registerTemplateSource: fileKey => signingRequest('post', `${root}/authoring/sources`, { fileKey }),
    templateDocument: (id, key) => signingRequest('get', `${root}/authoring/versions/${encodeURIComponent(id)}/documents/${encodeURIComponent(key)}`, null, { responseType: 'blob' }),
    cases: (q, config) => signingRequest('get', `${root}/creation/cases?${query({ q })}`, null, config),
    clientContext: (id, config) => signingRequest('get', `${root}/creation/clients/${encodeURIComponent(id)}`, null, config),
    caseContext: (id, config) => signingRequest('get', `${root}/creation/cases/${encodeURIComponent(id)}`, null, config),
    importLegacy: (id, locale, expectedVersion) => signingRequest('post', `${root}/templates/legacy/${id}/import`, { locale, ...(expectedVersion != null ? { expectedVersion } : {}) }),
    workbook: (versionId, locale, layout) => signingRequest('get', `${root}/templates/${versionId}/workbook?${query({ locale, ...(layout ? { layout: JSON.stringify(layout) } : {}) })}`, null, { responseType: 'blob' }),
    inspectWorkbook: (versionId, base64, layout) => signingRequest('post', `${root}/templates/${versionId}/workbook/inspect`, { base64, ...layout }),
    parseWorkbook: (versionId, base64, layout) => signingRequest('post', `${root}/templates/${versionId}/workbook`, { base64, ...layout }),
    previewCreation: body => signingRequest('post', `${root}/creation/preview`, body),
    drafts: () => signingRequest('get', `${root}/creation/drafts`),
    draft: id => signingRequest('get', `${root}/creation/drafts/${encodeURIComponent(id)}`),
    saveDraft: (id, body) => signingRequest('put', `${root}/creation/drafts/${encodeURIComponent(id)}`, body),
    submitDraft: (id, body) => signingRequest('post', `${root}/creation/drafts/${encodeURIComponent(id)}/submit`, body),
    create: (body, idempotencyKey) => signingRequest('post', `${root}/creation`, body, { headers: { 'Idempotency-Key': idempotencyKey } }),
};

export default signingPackagesApi;
