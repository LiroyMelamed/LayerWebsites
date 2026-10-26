import { signingRequest } from './signingTemplatesApi';

const base = caseId => `signing-v2/cases/${encodeURIComponent(caseId)}/stage-automation`;
const stage = (caseId, descriptionId) => `${base(caseId)}/${encodeURIComponent(descriptionId)}`;

const signingStageAutomationApi = {
    list: caseId => signingRequest('get', base(caseId)),
    preview: (caseId, descriptionId, body) => signingRequest('post', `${stage(caseId, descriptionId)}/preview`, body),
    save: (caseId, descriptionId, body) => signingRequest('put', stage(caseId, descriptionId), body),
    retry: (caseId, runId, expectedVersion) => signingRequest('post', `${base(caseId)}/runs/${encodeURIComponent(runId)}/retry`, { expectedVersion }),
};
export default signingStageAutomationApi;
