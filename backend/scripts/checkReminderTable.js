const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const pool = require('../config/db');

(async () => {
    try {
        const r = await pool.query(
            `SELECT column_name, data_type FROM information_schema.columns WHERE table_name='reminder_templates' ORDER BY ordinal_position`
        );
        if (r.rows.length === 0) {
            console.log('Table reminder_templates does NOT exist');
        } else {
            console.log('Table reminder_templates columns:');
            r.rows.forEach(row => console.log(`  ${row.column_name} (${row.data_type})`));
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
    pool.end();
})();
