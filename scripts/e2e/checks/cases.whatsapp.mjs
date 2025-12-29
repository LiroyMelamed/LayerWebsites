export const name = 'cases.whatsapp';

function nowIso() {
  return new Date().toISOString();
}

export async function run({ adminApi, prefix }) {
  const results = [];
  const startedAt = nowIso();

  // Pick a customer
  const customersRes = await adminApi.get('Customers/GetCustomers');
  if (!customersRes.ok || !Array.isArray(customersRes.responseJson) || customersRes.responseJson.length === 0) {
    return {
      name,
      results: [
        {
          check: 'whatsapp.precondition.customers',
          status: 'FAIL',
          httpCode: customersRes.status,
          notes: 'Could not fetch customers',
          evidence: customersRes,
        },
      ],
      meta: { startedAt },
    };
  }

  const customer = customersRes.responseJson[0];
  const customerUserId = customer.UserId ?? customer.userid;

  // Create a case type
  const caseTypeName = `${prefix}ct-whatsapp`;
  const ctBody = {
    CaseTypeName: caseTypeName,
    NumberOfStages: 1,
    Descriptions: [{ Stage: 1, Text: `${prefix}ct-s1` }],
  };

  const ctRes = await adminApi.post('CaseTypes/AddCaseType', ctBody);
  const caseTypeId = ctRes.responseJson?.CaseTypeId;
  results.push({
    check: 'whatsapp.createCaseType',
    status: ctRes.ok && caseTypeId ? 'PASS' : 'FAIL',
    httpCode: ctRes.status,
    notes: caseTypeId ? `CaseTypeId=${caseTypeId}` : 'missing CaseTypeId',
    evidence: ctRes,
  });
  if (!caseTypeId) {
    return { name, results, meta: { startedAt } };
  }

  // Create case with WhatsApp link
  const caseName = `${prefix}case-whatsapp`;
  const initialLink = 'https://chat.whatsapp.com/exampleInviteLink';
  const caseBody = {
    CaseName: caseName,
    CaseTypeId: caseTypeId,
    UserId: customerUserId,
    CompanyName: customer.CompanyName,
    CurrentStage: 1,
    Descriptions: [{ Stage: 1, Text: `${prefix}case-s1` }],
    PhoneNumber: customer.PhoneNumber,
    CustomerName: customer.Name,
    IsTagged: false,
    WhatsappGroupLink: initialLink,
    CaseManager: '',
    CaseManagerId: null,
    EstimatedCompletionDate: null,
    LicenseExpiryDate: null,
  };

  const createRes = await adminApi.post('Cases/AddCase', caseBody);
  const caseId = createRes.responseJson?.caseId;
  results.push({
    check: 'whatsapp.createCaseWithLink',
    status: createRes.ok && caseId ? 'PASS' : 'FAIL',
    httpCode: createRes.status,
    notes: caseId ? `caseId=${caseId}` : 'missing caseId',
    evidence: createRes,
  });
  if (!caseId) {
    // Cleanup case type best-effort
    await adminApi.del(`CaseTypes/DeleteCaseType/${caseTypeId}`);
    return { name, results, meta: { startedAt } };
  }

  // Read case returns link
  const readRes1 = await adminApi.get(`Cases/GetCase/${caseId}`);
  const link1 = readRes1.responseJson?.WhatsappGroupLink;
  results.push({
    check: 'whatsapp.readCaseHasLink',
    status: readRes1.ok && link1 === initialLink ? 'PASS' : 'FAIL',
    httpCode: readRes1.status,
    notes: `WhatsappGroupLink=${String(link1 || '')}`,
    evidence: readRes1,
  });

  // Update WhatsApp link
  const updatedLink = 'https://chat.whatsapp.com/updatedInviteLink';
  const updRes = await adminApi.put(`Cases/LinkWhatsappGroup/${caseId}`, {
    WhatsappGroupLink: updatedLink,
  });
  results.push({
    check: 'whatsapp.updateLink',
    status: updRes.ok ? 'PASS' : 'FAIL',
    httpCode: updRes.status,
    notes: updRes.ok ? 'updated' : 'failed',
    evidence: updRes,
  });

  const readRes2 = await adminApi.get(`Cases/GetCase/${caseId}`);
  const link2 = readRes2.responseJson?.WhatsappGroupLink;
  results.push({
    check: 'whatsapp.readCaseHasUpdatedLink',
    status: readRes2.ok && link2 === updatedLink ? 'PASS' : 'FAIL',
    httpCode: readRes2.status,
    notes: `WhatsappGroupLink=${String(link2 || '')}`,
    evidence: readRes2,
  });

  // Invalid URL behavior
  const badRes = await adminApi.put(`Cases/LinkWhatsappGroup/${caseId}`, {
    WhatsappGroupLink: 'javascript:alert(1)',
  });
  results.push({
    check: 'whatsapp.invalidUrlRejected',
    status: badRes.status === 400 ? 'PASS' : 'FAIL',
    httpCode: badRes.status,
    notes: badRes.status === 400 ? 'rejected as expected' : 'expected 400',
    evidence: badRes,
  });

  // Empty/clear behavior
  const clearRes = await adminApi.put(`Cases/LinkWhatsappGroup/${caseId}`, {
    WhatsappGroupLink: '',
  });
  results.push({
    check: 'whatsapp.clearLink',
    status: clearRes.ok ? 'PASS' : 'FAIL',
    httpCode: clearRes.status,
    notes: clearRes.ok ? 'cleared' : 'failed',
    evidence: clearRes,
  });

  const readRes3 = await adminApi.get(`Cases/GetCase/${caseId}`);
  const link3 = readRes3.responseJson?.WhatsappGroupLink;
  const cleared = link3 === null || link3 === undefined || link3 === '';
  results.push({
    check: 'whatsapp.readCaseLinkCleared',
    status: readRes3.ok && cleared ? 'PASS' : 'FAIL',
    httpCode: readRes3.status,
    notes: `WhatsappGroupLink=${String(link3 || '')}`,
    evidence: readRes3,
  });

  // Cleanup
  const delCase = await adminApi.del(`Cases/DeleteCase/${caseId}`);
  results.push({
    check: 'whatsapp.cleanup.deleteCase',
    status: delCase.ok ? 'PASS' : 'FAIL',
    httpCode: delCase.status,
    notes: delCase.ok ? 'deleted' : 'failed',
    evidence: delCase,
  });

  const delCt = await adminApi.del(`CaseTypes/DeleteCaseType/${caseTypeId}`);
  results.push({
    check: 'whatsapp.cleanup.deleteCaseType',
    status: delCt.ok ? 'PASS' : 'FAIL',
    httpCode: delCt.status,
    notes: delCt.ok ? 'deleted' : 'failed',
    evidence: delCt,
  });

  return {
    name,
    meta: { startedAt, caseId, caseTypeId, customerUserId },
    results,
  };
}
