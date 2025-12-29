export const name = 'dashboard';

function hasKeys(obj, keys) {
  return keys.every((k) => Object.prototype.hasOwnProperty.call(obj || {}, k));
}

export async function run({ adminApi, userApi }) {
  const results = [];

  const adminRes = await adminApi.get('Data/GetMainScreenData');
  const expectedKeys = [
    'AllCasesData',
    'ClosedCasesData',
    'TaggedCases',
    'NumberOfClosedCases',
    'NumberOfTaggedCases',
    'AllCustomersData',
    'ActiveCustomers',
  ];

  if (adminRes.ok && hasKeys(adminRes.responseJson, expectedKeys)) {
    results.push({
      check: 'dashboard.admin',
      status: 'PASS',
      httpCode: adminRes.status,
      notes: `keys ok; durationMs=${adminRes.durationMs}`,
      evidence: adminRes,
    });
  } else {
    results.push({
      check: 'dashboard.admin',
      status: 'FAIL',
      httpCode: adminRes.status,
      notes: 'missing keys or non-200',
      evidence: adminRes,
    });
  }

  const userRes = await userApi.get('Data/GetMainScreenData');
  const userOk = userRes.status === 403 || userRes.status === 401;
  results.push({
    check: 'dashboard.userDenied',
    status: userOk ? 'PASS' : 'FAIL',
    httpCode: userRes.status,
    notes: userOk ? 'non-admin denied as expected' : 'non-admin unexpectedly allowed',
    evidence: userRes,
  });

  return { name, results };
}
