export const name = 'notifications';

function parseDate(value) {
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

export async function run({ adminApi, userApi, prefix }) {
  const results = [];
  const startedAt = new Date();

  // Precondition: need a user to receive notifications
  const customersRes = await adminApi.get('Customers/GetCustomers');
  if (!customersRes.ok || !Array.isArray(customersRes.responseJson) || customersRes.responseJson.length === 0) {
    return {
      name,
      results: [
        {
          check: 'notifications.precondition.customers',
          status: 'FAIL',
          httpCode: customersRes.status,
          notes: 'Could not fetch customers',
          evidence: customersRes,
        },
      ],
    };
  }

  const customer = customersRes.responseJson[0];
  const customerUserId = customer.UserId ?? customer.userid;

  // Create a case type + case to generate a notification
  const caseTypeName = `${prefix}ct-notif`;
  const ctRes = await adminApi.post('CaseTypes/AddCaseType', {
    CaseTypeName: caseTypeName,
    NumberOfStages: 1,
    Descriptions: [{ Stage: 1, Text: `${prefix}ct-s1` }],
  });
  const caseTypeId = ctRes.responseJson?.CaseTypeId;
  results.push({
    check: 'notifications.setup.createCaseType',
    status: ctRes.ok && caseTypeId ? 'PASS' : 'FAIL',
    httpCode: ctRes.status,
    notes: caseTypeId ? `CaseTypeId=${caseTypeId}` : 'missing CaseTypeId',
    evidence: ctRes,
  });
  if (!caseTypeId) return { name, results };

  const caseName = `${prefix}case-notif`;
  const createRes = await adminApi.post('Cases/AddCase', {
    CaseName: caseName,
    CaseTypeId: caseTypeId,
    UserId: customerUserId,
    CompanyName: customer.CompanyName,
    CurrentStage: 1,
    Descriptions: [{ Stage: 1, Text: `${prefix}case-s1` }],
    PhoneNumber: customer.PhoneNumber,
    CustomerName: customer.Name,
    IsTagged: false,
    CaseManager: '',
    CaseManagerId: null,
    EstimatedCompletionDate: null,
    LicenseExpiryDate: null,
  });
  const caseId = createRes.responseJson?.caseId;
  results.push({
    check: 'notifications.setup.createCase',
    status: createRes.ok && caseId ? 'PASS' : 'FAIL',
    httpCode: createRes.status,
    notes: caseId ? `caseId=${caseId}` : 'missing caseId',
    evidence: createRes,
  });
  if (!caseId) {
    await adminApi.del(`CaseTypes/DeleteCaseType/${caseTypeId}`);
    return { name, results };
  }

  // Trigger WhatsApp-linked notification twice quickly (idempotency check)
  const link = 'https://chat.whatsapp.com/notifyInviteLink';
  const link1 = await adminApi.put(`Cases/LinkWhatsappGroup/${caseId}`, { WhatsappGroupLink: link });
  const link2 = await adminApi.put(`Cases/LinkWhatsappGroup/${caseId}`, { WhatsappGroupLink: link });
  results.push({
    check: 'notifications.idempotency.triggerTwice',
    status: link1.ok && link2.ok ? 'PASS' : 'FAIL',
    httpCode: link2.status,
    notes: 'LinkWhatsappGroup called twice',
    evidence: { first: link1, second: link2 },
  });

  // List notifications (paged)
  const list1 = await userApi.get('Notifications?limit=50&offset=0');
  const listOk = list1.ok && Array.isArray(list1.responseJson);
  results.push({
    check: 'notifications.list',
    status: listOk ? 'PASS' : 'FAIL',
    httpCode: list1.status,
    notes: listOk ? `count=${list1.responseJson.length}` : 'expected array',
    evidence: list1,
  });
  if (!listOk) {
    // Cleanup best-effort
    await adminApi.del(`Cases/DeleteCase/${caseId}`);
    await adminApi.del(`CaseTypes/DeleteCaseType/${caseTypeId}`);
    return { name, results };
  }

  const recent = list1.responseJson
    .filter((n) => {
      const created = parseDate(n.CreatedAt);
      return created && created >= startedAt;
    })
    .filter((n) => String(n.Title || '').includes('וואטסאפ') || String(n.Message || '').includes(caseName));

  // Dedupe expectation: only one WhatsApp-linked notification within the window
  const linked = recent.filter((n) => String(n.Title || '') === 'קבוצת וואטסאפ מקושרת');
  results.push({
    check: 'notifications.idempotency.noDuplicateInDb',
    status: linked.length <= 1 ? 'PASS' : 'FAIL',
    httpCode: 200,
    notes: `linkedCount=${linked.length}`,
    evidence: { recentCount: recent.length, linked },
  });

  // Mark as read (pick newest notification)
  const target = list1.responseJson[0];
  const unreadBefore = list1.responseJson.filter((n) => n.IsRead === false).length;

  const mark = await userApi.put(`Notifications/${target.NotificationId}/read`, {});
  results.push({
    check: 'notifications.markRead',
    status: mark.ok ? 'PASS' : 'FAIL',
    httpCode: mark.status,
    notes: `NotificationId=${target.NotificationId}`,
    evidence: mark,
  });

  // Mark again (idempotent)
  const mark2 = await userApi.put(`Notifications/${target.NotificationId}/read`, {});
  results.push({
    check: 'notifications.markReadTwice',
    status: mark2.ok ? 'PASS' : 'FAIL',
    httpCode: mark2.status,
    notes: 'second call should be safe',
    evidence: mark2,
  });

  // List again and verify unread count decreased or stayed consistent
  const list2 = await userApi.get('Notifications?limit=50&offset=0');
  const unreadAfter = Array.isArray(list2.responseJson)
    ? list2.responseJson.filter((n) => n.IsRead === false).length
    : null;

  const unreadOk = unreadAfter !== null && unreadAfter <= unreadBefore;
  results.push({
    check: 'notifications.unreadCountNonIncreasing',
    status: unreadOk ? 'PASS' : 'FAIL',
    httpCode: list2.status,
    notes: `unreadBefore=${unreadBefore}, unreadAfter=${unreadAfter}`,
    evidence: list2,
  });

  // Cleanup
  const delCase = await adminApi.del(`Cases/DeleteCase/${caseId}`);
  const delCt = await adminApi.del(`CaseTypes/DeleteCaseType/${caseTypeId}`);

  results.push({
    check: 'notifications.cleanup.deleteCase',
    status: delCase.ok ? 'PASS' : 'FAIL',
    httpCode: delCase.status,
    notes: 'cleanup',
    evidence: delCase,
  });

  results.push({
    check: 'notifications.cleanup.deleteCaseType',
    status: delCt.ok ? 'PASS' : 'FAIL',
    httpCode: delCt.status,
    notes: 'cleanup',
    evidence: delCt,
  });

  return {
    name,
    meta: { caseId, caseTypeId, customerUserId },
    results,
  };
}
