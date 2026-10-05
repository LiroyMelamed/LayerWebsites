// PREVIEW by default. Apply only after environment/schema/backup review and explicit authorization.
const { planAndSeedOfficeBaseline } = require('../lib/officeBaselineRole');
async function main() {
    const args = process.argv.slice(2);
    const accepted = new Set(['--apply', '--tenant-mode=dedicated', '--tenant-mode=shared', '--preserve-custom']);
    if (args.some(arg => !accepted.has(arg))) throw new Error('Unknown argument');
    if (args.filter(arg => arg.startsWith('--tenant-mode=')).length !== 1) throw new Error('Choose exactly one explicit tenant deployment mode');
    const tenantMode = args.includes('--tenant-mode=shared') ? 'shared' : args.includes('--tenant-mode=dedicated') ? 'dedicated' : undefined;
    const pool = require('../config/db');
    const client = await pool.connect();
    try {
        const result = await planAndSeedOfficeBaseline(client, { apply: args.includes('--apply'), tenantMode, preserveCustom: args.includes('--preserve-custom') });
        console.log(JSON.stringify(result, null, 2)); // Aggregate counts only; no customer/user records.
    } finally { client.release(); await pool.end(); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
