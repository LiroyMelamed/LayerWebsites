const pool = require('../config/db');
(async () => {
    const { rows } = await pool.query(
        "SELECT setting_key, setting_value, updated_at FROM platform_settings WHERE setting_key = 'BIRTHDAY_SMS'"
    );
    console.log('BIRTHDAY_SMS setting:', JSON.stringify(rows, null, 2));

    const { rows: sent } = await pool.query(
        "SELECT * FROM birthday_greetings_sent ORDER BY sent_date DESC LIMIT 10"
    );
    console.log('Recent birthday greetings sent:', JSON.stringify(sent, null, 2));

    process.exit(0);
})();
