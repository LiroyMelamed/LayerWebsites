// PP/DEV ONLY: Cleanup all customers and their legal/evidence data except the one with phone 0501234567
// Usage:
//   node backend/scripts/pp-cleanup-customers-preserve-phone.js           (preview mode)
//   CLEANUP_APPLY=true node backend/scripts/pp-cleanup-customers-preserve-phone.js   (apply mode)

const { Pool } = require('pg');
const assert = require('assert');

const PRESERVE_PHONE = '0501234567';
const IS_APPLY = String(process.env.CLEANUP_APPLY || '').toLowerCase() === 'true';
const IS_PROD = String(process.env.IS_PRODUCTION || '').toLowerCase() === 'true' || String(process.env.NODE_ENV || '').toLowerCase() === 'production';

const pool = new Pool();

async function main() {
  if (IS_PROD) {
    console.error('ABORT: This script must NOT run on production!');
    process.exit(1);
  }

  // 1. Find the preserved user
  const { rows: preservedRows } = await pool.query(
    `SELECT userid, email, phonenumber, role FROM users WHERE phonenumber = $1`,
    [PRESERVE_PHONE]
  );
  if (preservedRows.length !== 1) {
    console.error(`ABORT: Preserved user with phone ${PRESERVE_PHONE} not found exactly once (found ${preservedRows.length})`);
    process.exit(1);
  }
  const preserved = preservedRows[0];
  if (preserved.role !== 'User') {
    console.error(`ABORT: Preserved user with phone ${PRESERVE_PHONE} does not have role 'User' (found role='${preserved.role}')`);
    process.exit(1);
  }
  const preservedId = preserved.userid;

  // 2. Find all other customer IDs
  const { rows: delUserRows } = await pool.query(
    `SELECT userid FROM users WHERE role = 'User' AND userid != $1`,
    [preservedId]
  );
  const delUserIds = delUserRows.map(r => r.userid);

  // 3. Find all case IDs for those users
  const { rows: delCaseRows } = await pool.query(
    `SELECT caseid FROM cases WHERE clientid = ANY($1)`,
    [delUserIds]
  );
  const delCaseIds = delCaseRows.map(r => r.caseid);

  // 4. Find all signingfile IDs for those users (clientid, lawyerid, createdbyid)
  const { rows: delSigningFileRows } = await pool.query(
    `SELECT signingfileid FROM signingfiles WHERE clientid = ANY($1) OR lawyerid = ANY($1) OR createdbyid = ANY($1)`,
    [delUserIds]
  );
  const delSigningFileIds = delSigningFileRows.map(r => r.signingfileid);

  // 5. Preview counts
  const previewCounts = async () => {
    const counts = {};
    const count = async (table, where, params) => {
      const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM ${table} ${where}`, params);
      counts[table] = rows[0].c;
    };
    await count('cases', 'WHERE clientid = ANY($1)', [delUserIds]);
    await count('casedescriptions', 'WHERE caseid = ANY($1)', [delCaseIds]);
    await count('signingfiles', 'WHERE signingfileid = ANY($1)', [delSigningFileIds]);
    await count('signaturespots', 'WHERE signingfileid = ANY($1)', [delSigningFileIds]);
    await count('signing_consents', 'WHERE signingfileid = ANY($1)', [delSigningFileIds]);
    await count('signing_otp_challenges', 'WHERE signingfileid = ANY($1)', [delSigningFileIds]);
    await count('audit_events', 'WHERE userid = ANY($1) OR signingfileid = ANY($2)', [delUserIds, delSigningFileIds]);
    await count('refresh_tokens', 'WHERE userid = ANY($1)', [delUserIds]);
    await count('userdevices', 'WHERE userid = ANY($1)', [delUserIds]);
    await count('usernotifications', 'WHERE userid = ANY($1)', [delUserIds]);
    await count('otps', 'WHERE userid = ANY($1)', [delUserIds]);
    await count('users', "WHERE role = 'User' AND userid != $1", [preservedId]);
    return counts;
  };

  if (!IS_APPLY) {
    console.log('--- PP CLEANUP PREVIEW ---');
    console.log('Preserved user:', { id: preservedId, email: preserved.email, phone: preserved.phonenumber });
    console.log('Customers to delete:', delUserIds.length);
    const counts = await previewCounts();
    for (const [table, c] of Object.entries(counts)) {
      console.log(`Would delete from ${table}: ${c}`);
    }
    await pool.end();
    return;
  }

  // 6. Apply mode: delete in FK-safe order
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Step 1: tokens/devices/notifications/otps
    await client.query('DELETE FROM refresh_tokens WHERE userid = ANY($1)', [delUserIds]);
    await client.query('DELETE FROM userdevices WHERE userid = ANY($1)', [delUserIds]);
    await client.query('DELETE FROM usernotifications WHERE userid = ANY($1)', [delUserIds]);
    await client.query('DELETE FROM otps WHERE userid = ANY($1)', [delUserIds]);
    // Step 2: signingfile ids already found
    // Step 3: audit_events
    await client.query('DELETE FROM audit_events WHERE userid = ANY($1) OR signingfileid = ANY($2)', [delUserIds, delSigningFileIds]);
    // Step 4: signing_otp_challenges, signing_consents
    await client.query('DELETE FROM signing_otp_challenges WHERE signingfileid = ANY($1)', [delSigningFileIds]);
    await client.query('DELETE FROM signing_consents WHERE signingfileid = ANY($1)', [delSigningFileIds]);
    // Step 5: signaturespots
    await client.query('DELETE FROM signaturespots WHERE signingfileid = ANY($1)', [delSigningFileIds]);
    // Step 6: signingfiles
    await client.query('DELETE FROM signingfiles WHERE signingfileid = ANY($1)', [delSigningFileIds]);
    // Step 7: casedescriptions
    await client.query('DELETE FROM casedescriptions WHERE caseid = ANY($1)', [delCaseIds]);
    // Step 8: cases
    await client.query('DELETE FROM cases WHERE caseid = ANY($1)', [delCaseIds]);
    // Step 9: users
    await client.query("DELETE FROM users WHERE role = 'User' AND userid != $1", [preservedId]);
    await client.query('COMMIT');
    console.log('--- PP CLEANUP APPLIED ---');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  // Print after counts
  const counts = await previewCounts();
  for (const [table, c] of Object.entries(counts)) {
    console.log(`After cleanup, remaining in ${table}: ${c}`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
