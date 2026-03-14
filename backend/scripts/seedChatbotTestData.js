/**
 * Seed script for chatbot local testing.
 *
 * Inserts a test client, a test case (linked via case_users), a notification,
 * and a casetype so the RAG pipeline returns meaningful context.
 *
 * Usage:
 *   cd backend
 *   node scripts/seedChatbotTestData.js
 *
 * Test phone: 0500000000
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = require('../config/db');

const TEST_PHONE = '0500000000';
const TEST_NAME = 'לקוח בדיקה';
const TEST_EMAIL = 'test-chatbot@melamedlaw.local';
const TEST_CASE_NAME = 'תיק בדיקת צ׳אטבוט';
const TEST_CASE_TYPE = 'אזרחי';

async function seed() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Find or create casetype
        let caseTypeId;
        const selCt = await client.query(
            `SELECT casetypeid FROM casetypes WHERE casetypename = $1 LIMIT 1`,
            [TEST_CASE_TYPE]
        );
        if (selCt.rows.length > 0) {
            caseTypeId = selCt.rows[0].casetypeid;
        } else {
            const ctRes = await client.query(
                `INSERT INTO casetypes (casetypename, numberofstages)
                 VALUES ($1, 5)
                 RETURNING casetypeid`,
                [TEST_CASE_TYPE]
            );
            caseTypeId = ctRes.rows[0].casetypeid;
        }

        // 2. Upsert test user
        let userId;
        const existingUser = await client.query(
            `SELECT userid FROM users WHERE phonenumber = $1 LIMIT 1`,
            [TEST_PHONE]
        );
        if (existingUser.rows.length > 0) {
            userId = existingUser.rows[0].userid;
            console.log(`Test user already exists (userid=${userId}), skipping insert.`);
        } else {
            const userRes = await client.query(
                `INSERT INTO users (name, email, phonenumber, role, createdat)
                 VALUES ($1, $2, $3, 'Client', NOW())
                 RETURNING userid`,
                [TEST_NAME, TEST_EMAIL, TEST_PHONE]
            );
            userId = userRes.rows[0].userid;
            console.log(`Created test user: userid=${userId}`);
        }

        // 3. Upsert test case
        let caseId;
        const existingCase = await client.query(
            `SELECT caseid FROM cases WHERE casename = $1 LIMIT 1`,
            [TEST_CASE_NAME]
        );
        if (existingCase.rows.length > 0) {
            caseId = existingCase.rows[0].caseid;
            // Update to current date
            await client.query(
                `UPDATE cases SET updatedat = NOW(), currentstage = 3 WHERE caseid = $1`,
                [caseId]
            );
            console.log(`Test case already exists (caseid=${caseId}), updated timestamp.`);
        } else {
            const caseRes = await client.query(
                `INSERT INTO cases (casename, casetypeid, userid, currentstage, isclosed, createdat, updatedat, casetypename)
                 VALUES ($1, $2, $3, 3, false, NOW(), NOW(), $4)
                 RETURNING caseid`,
                [TEST_CASE_NAME, caseTypeId, userId, TEST_CASE_TYPE]
            );
            caseId = caseRes.rows[0].caseid;
            console.log(`Created test case: caseid=${caseId}`);
        }

        // 4. Link user to case via case_users
        await client.query(
            `INSERT INTO case_users (caseid, userid)
             VALUES ($1, $2)
             ON CONFLICT (caseid, userid) DO NOTHING`,
            [caseId, userId]
        );
        console.log(`Linked user ${userId} to case ${caseId}`);

        // 5. Insert test notification
        await client.query(
            `INSERT INTO usernotifications (userid, title, message, isread, createdat)
             VALUES ($1, $2, $3, false, NOW())`,
            [userId, 'עדכון בתיק', 'הדיון הבא נקבע לתאריך 20/04/2026 בבית משפט השלום תל אביב.']
        );
        console.log('Created test notification');

        // 6. Insert a casedescription (timeline entry) if table exists
        try {
            await client.query(
                `INSERT INTO casedescriptions (caseid, description, updatedat)
                 VALUES ($1, $2, NOW())`,
                [caseId, 'הוגשה בקשה להארכת מועד. בית המשפט אישר.']
            );
            console.log('Created test timeline entry (casedescription)');
        } catch {
            console.log('Skipped casedescription insert (table may not match expected schema)');
        }

        await client.query('COMMIT');

        console.log('\n✅ Chatbot test data seeded successfully!');
        console.log(`   Phone: ${TEST_PHONE}`);
        console.log(`   User ID: ${userId}`);
        console.log(`   Case ID: ${caseId}`);
        console.log(`   Case Type: ${TEST_CASE_TYPE}`);
        console.log(`   Case Name: ${TEST_CASE_NAME}\n`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Seed failed:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

seed();
