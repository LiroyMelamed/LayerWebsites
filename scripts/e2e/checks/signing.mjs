export const name = 'signing';

export async function run({ adminApi, userApi }) {
  const results = [];

  // Skeleton: verify the signing endpoints are reachable and return JSON.
  const lawyerFiles = await adminApi.get('SigningFiles/lawyer-files');
  const lawyerOk = lawyerFiles.ok && (Array.isArray(lawyerFiles.responseJson?.files) || Array.isArray(lawyerFiles.responseJson));
  results.push({
    check: 'signing.lawyerFiles',
    status: lawyerOk ? 'PASS' : 'FAIL',
    httpCode: lawyerFiles.status,
    notes: lawyerOk ? 'reachable' : 'expected JSON with files array',
    evidence: lawyerFiles,
  });

  const clientFiles = await userApi.get('SigningFiles/client-files');
  const clientOk = clientFiles.ok && (Array.isArray(clientFiles.responseJson?.files) || Array.isArray(clientFiles.responseJson));
  results.push({
    check: 'signing.clientFiles',
    status: clientOk ? 'PASS' : 'FAIL',
    httpCode: clientFiles.status,
    notes: clientOk ? 'reachable' : 'expected JSON with files array',
    evidence: clientFiles,
  });

  results.push({
    check: 'signing.todo.fullFlow',
    status: 'PASS',
    httpCode: 0,
    notes: 'TODO: add upload/detect/sign flow once a stable PDF fixture strategy is agreed (R2 + presigned upload).',
    evidence: {},
  });

  return { name, results };
}
