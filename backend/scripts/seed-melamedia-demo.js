#!/usr/bin/env node
/**
 * Melamedia QA/demo seed — Melamedia DB ONLY.
 * Run on backend host from /root/Melamedia/backend:
 *   node scripts/seed-melamedia-demo.js
 *
 * Uploads sample PDFs to R2 (prefix melamedia/demo/) and seeds cases, stages,
 * files, signing, calendar, reminders, notifications for:
 *   - 0507299064 platform admin
 *   - 0501234567 demo client (primary dataset owner)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

const env = { ...process.env, ...loadEnv(path.join(__dirname, '..', '.env')) };

const DEMO_PDF = process.env.MELAMEDIA_DEMO_PDF || '/tmp/melamedia-demo.pdf';

async function main() {
  if (!fs.existsSync(DEMO_PDF)) {
    throw new Error(`Missing demo PDF at ${DEMO_PDF}`);
  }
  const pdfBuf = fs.readFileSync(DEMO_PDF);

  const db = new Client({
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT || 5432),
    user: env.DB_USER || 'postgres',
    password: env.DB_PASSWORD,
    database: env.DB_NAME || 'melamedia',
    ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  await db.connect();

  const dbName = (await db.query('SELECT current_database() AS d')).rows[0].d;
  if (dbName !== 'melamedia') {
    throw new Error(`Refusing to seed non-melamedia database: ${dbName}`);
  }

  const s3 = new S3Client({
    region: 'auto',
    endpoint: env.S3_ENDPOINT,
    credentials: {
      accessKeyId: env.S3_KEY || env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET || env.AWS_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
  });
  const bucket = env.S3_BUCKET;
  if (!bucket) throw new Error('S3_BUCKET missing');

  async function putPdf(key, body) {
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'application/pdf',
    }));
    return key;
  }

  console.log('[seed] ensuring users / platform admin…');
  await db.query(`
    INSERT INTO users (name, email, phonenumber, role, companyname)
    SELECT 'לירוי מלמד', 'liroy@melamedia.co.il', '0507299064', 'Admin', 'Melamedia'
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE phonenumber = '0507299064');
    UPDATE users SET role = 'Admin', name = COALESCE(NULLIF(name,''), 'לירוי מלמד'), companyname = 'Melamedia'
    WHERE phonenumber = '0507299064';

    INSERT INTO users (name, email, phonenumber, role, companyname)
    SELECT 'יוסי כהן', 'client1@example.com', '0501234567', 'Client', NULL
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE phonenumber = '0501234567');
    UPDATE users SET role = 'Client', name = 'יוסי כהן' WHERE phonenumber = '0501234567';

    INSERT INTO users (name, email, phonenumber, role, companyname)
    SELECT 'עו״ד דנה שמש', 'dana@melamedia.co.il', '0504111111', 'Lawyer', 'Melamedia'
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE phonenumber = '0504111111');
    INSERT INTO users (name, email, phonenumber, role, companyname)
    SELECT 'עו״ד אמיר גולן', 'amir@melamedia.co.il', '0505111111', 'Lawyer', 'Melamedia'
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE phonenumber = '0505111111');
  `);

  const users = (await db.query(`
    SELECT userid, phonenumber, role FROM users
    WHERE phonenumber IN ('0507299064','0501234567','0504111111','0505111111')
  `)).rows;
  const byPhone = Object.fromEntries(users.map((u) => [u.phonenumber, u]));
  const adminId = byPhone['0507299064'].userid;
  const clientId = byPhone['0501234567'].userid;
  const lawyerDana = byPhone['0504111111'].userid;
  const lawyerAmir = byPhone['0505111111'].userid;

  await db.query(`
    INSERT INTO platform_admins (user_id, name, is_active)
    SELECT $1, 'Platform Admin', true
    WHERE NOT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = $1);
    UPDATE platform_admins SET is_active = true WHERE user_id = $1;
  `, [adminId]);

  console.log('[seed] case types + stage labels…');
  await db.query(`
    UPDATE casetypes SET casetypename = 'נדל״ן', numberofstages = 4 WHERE casetypeid = 3;
    UPDATE casetypes SET casetypename = 'תאונת דרכים - נזק גוף', numberofstages = 4 WHERE casetypeid = 2;
    UPDATE casetypes SET casetypename = 'כללי', numberofstages = 3 WHERE casetypeid = 1;
    INSERT INTO casetypes (casetypename, numberofstages)
    SELECT 'חוזים מסחריים', 3
    WHERE NOT EXISTS (SELECT 1 FROM casetypes WHERE casetypename = 'חוזים מסחריים');
  `);

  // Wipe & reinsert stage labels for known types (idempotent by delete+insert for melamedia demo)
  await db.query(`DELETE FROM casetypedescriptions WHERE casetypeid IN (SELECT casetypeid FROM casetypes)`);
  const typeRows = (await db.query(`SELECT casetypeid, casetypename, numberofstages FROM casetypes ORDER BY casetypeid`)).rows;
  const stageLabels = {
    'נדל״ן': ['פתיחת תיק', 'בדיקת מסמכים', 'משא ומתן', 'סגירה'],
    'תאונת דרכים - נזק גוף': ['דיווח ראשוני', 'איסוף ראיות', 'תביעה', 'פשרה/פסק דין'],
    'כללי': ['קליטה', 'טיפול', 'סיום'],
    'חוזים מסחריים': ['טיוטה', 'משא ומתן', 'חתימה'],
  };
  for (const t of typeRows) {
    const labels = stageLabels[t.casetypename] || Array.from({ length: t.numberofstages || 3 }, (_, i) => `שלב ${i + 1}`);
    for (let i = 0; i < labels.length; i++) {
      await db.query(
        `INSERT INTO casetypedescriptions (casetypeid, stage, text) VALUES ($1, $2, $3)`,
        [t.casetypeid, i + 1, labels[i]]
      );
    }
    await db.query(`UPDATE casetypes SET numberofstages = $2 WHERE casetypeid = $1`, [t.casetypeid, labels.length]);
  }

  const typeByName = Object.fromEntries(
    (await db.query(`SELECT casetypeid, casetypename FROM casetypes`)).rows.map((r) => [r.casetypename, r.casetypeid])
  );

  console.log('[seed] rebuild demo cases for client 0501234567…');
  // Remove previous thin demo cases owned by anyone for clean showcase (Melamedia only)
  await db.query(`
    DELETE FROM calendar_events WHERE owner_id = $1 OR client_user_id = $2;
    DELETE FROM signaturespots WHERE signingfileid IN (SELECT signingfileid FROM signingfiles WHERE clientid = $2 OR lawyerid = $1);
    DELETE FROM signingfiles WHERE clientid = $2 OR lawyerid = $1;
    DELETE FROM stage_files WHERE caseid IN (SELECT caseid FROM cases);
    DELETE FROM uploadedfiles WHERE caseid IN (SELECT caseid FROM cases);
    DELETE FROM casedescriptions WHERE caseid IN (SELECT caseid FROM cases);
    DELETE FROM case_users;
    DELETE FROM cases;
    DELETE FROM scheduled_email_reminders WHERE user_id IN ($1, $2);
    DELETE FROM usernotifications WHERE userid IN ($1, $2);
    DELETE FROM reminder_templates WHERE template_key LIKE 'melamedia_demo_%';
  `, [adminId, clientId]);

  const casesSpec = [
    {
      name: 'רכישת דירה — כהן',
      type: 'נדל״ן',
      stage: 2,
      manager: lawyerDana,
      managerName: 'עו״ד דנה שמש',
      tagged: true,
      closed: false,
      company: 'כהן השקעות בע״מ',
      est: '2026-12-15',
      license: true,
      licenseDate: '2027-03-01',
    },
    {
      name: 'תאונת דרכים — כהן',
      type: 'תאונת דרכים - נזק גוף',
      stage: 3,
      manager: lawyerAmir,
      managerName: 'עו״ד אמיר גולן',
      tagged: false,
      closed: false,
      company: null,
      est: '2026-10-01',
      license: false,
      licenseDate: null,
    },
    {
      name: 'ייעוץ חוזי — כהן',
      type: 'חוזים מסחריים',
      stage: 2,
      manager: lawyerDana,
      managerName: 'עו״ד דנה שמש',
      tagged: true,
      closed: false,
      company: 'כהן טק בע״מ',
      est: '2026-09-30',
      license: false,
      licenseDate: null,
    },
    {
      name: 'תיק כללי סגור — כהן',
      type: 'כללי',
      stage: 3,
      manager: lawyerAmir,
      managerName: 'עו״ד אמיר גולן',
      tagged: false,
      closed: true,
      company: null,
      est: '2026-06-01',
      license: false,
      licenseDate: null,
    },
  ];

  const caseIds = [];
  for (const c of casesSpec) {
    const typeId = typeByName[c.type];
    const res = await db.query(
      `INSERT INTO cases (
         casename, casetypeid, userid, companyname, currentstage, isclosed, istagged,
         casetypename, casemanager, casemanagerid, estimatedcompletiondate,
         haslicenseexpiry, licenseexpirydate, createdat, updatedat
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now(), now())
       RETURNING caseid`,
      [
        c.name, typeId, clientId, c.company, c.stage, c.closed, c.tagged,
        c.type, c.managerName, c.manager, c.est,
        c.license, c.licenseDate,
      ]
    );
    const caseId = res.rows[0].caseid;
    caseIds.push(caseId);

    // Link admin + lawyers + client
    for (const uid of [adminId, clientId, lawyerDana, lawyerAmir]) {
      await db.query(
        `INSERT INTO case_users (caseid, userid) VALUES ($1,$2)
         ON CONFLICT (caseid, userid) DO NOTHING`,
        [caseId, uid]
      );
    }

    const stages = (await db.query(
      `SELECT stage, text FROM casetypedescriptions WHERE casetypeid = $1 ORDER BY stage`,
      [typeId]
    )).rows;
    for (const s of stages) {
      await db.query(
        `INSERT INTO casedescriptions (caseid, stage, text, isnew, timestamp)
         VALUES ($1,$2,$3,$4, now() - ($5 || ' days')::interval)`,
        [caseId, s.stage, `${s.text} — עדכון הדגמה לתיק ${c.name}`, s.stage === c.stage, String(Math.max(0, (c.stage - s.stage) * 3))]
      );
    }
  }

  console.log('[seed] upload demo PDFs + file rows…');
  const fileKeys = {};
  for (let i = 0; i < caseIds.length; i++) {
    const caseId = caseIds[i];
    const stageKey = `melamedia/demo/cases/${caseId}/stage-${casesSpec[i].stage}/demo-stage.pdf`;
    const uploadKey = `melamedia/demo/cases/${caseId}/uploads/demo-upload.pdf`;
    await putPdf(stageKey, pdfBuf);
    await putPdf(uploadKey, pdfBuf);
    fileKeys[caseId] = { stageKey, uploadKey };

    await db.query(
      `INSERT INTO stage_files (caseid, stage, file_key, file_name, file_ext, file_mime, file_size, uploaded_by)
       VALUES ($1,$2,$3,$4,'pdf','application/pdf',$5,$6)`,
      [caseId, casesSpec[i].stage, stageKey, `מסמך-שלב-${casesSpec[i].stage}.pdf`, pdfBuf.length, adminId]
    );
    await db.query(
      `INSERT INTO uploadedfiles (caseid, filepath) VALUES ($1,$2)`,
      [caseId, uploadKey]
    );
  }

  console.log('[seed] signing sample…');
  const signKey = `melamedia/demo/signing/unsigned-cohen.pdf`;
  await putPdf(signKey, pdfBuf);
  const signRes = await db.query(
    `INSERT INTO signingfiles (
       caseid, lawyerid, clientid, filename, filekey, originalfilekey, status, notes, requireotp, createdat, expiresat
     ) VALUES ($1,$2,$3,$4,$5,$5,'pending','הדגמת חתימה — מלמדיה', true, now(), now() + interval '14 days')
     RETURNING signingfileid`,
    [caseIds[0], lawyerDana, clientId, 'הסכם-רכישה-לחתימה.pdf', signKey]
  );
  const signingFileId = signRes.rows[0].signingfileid;
  await db.query(
    `INSERT INTO signaturespots (
       signingfileid, pagenumber, x, y, width, height, signername, isrequired, issigned, signeruserid, fieldtype, fieldlabel
     ) VALUES
       ($1, 1, 80, 120, 180, 60, 'יוסי כהן', true, false, $2, 'signature', 'חתימת לקוח'),
       ($1, 1, 80, 220, 180, 40, 'יוסי כהן', true, false, $2, 'date', 'תאריך')`,
    [signingFileId, clientId]
  );

  console.log('[seed] calendar events…');
  await db.query(
    `INSERT INTO calendar_events (
       owner_id, case_id, title, description, location, start_time, end_time, all_day,
       client_name, manager_name, color, client_user_id, manager_user_id, event_type
     ) VALUES
     ($1, $3, 'פגישת ייעוץ — כהן', 'הדגמת פגישה', 'זום',
      (date_trunc('day', now() AT TIME ZONE 'Asia/Jerusalem') + interval '1 day' + time '10:00') AT TIME ZONE 'Asia/Jerusalem',
      (date_trunc('day', now() AT TIME ZONE 'Asia/Jerusalem') + interval '1 day' + time '11:00') AT TIME ZONE 'Asia/Jerusalem',
      false, 'יוסי כהן', 'עו״ד דנה שמש', '#3B82F6', $2, $4, 'appointment'),
     ($1, $5, 'דיון — כהן', 'הדגמת דיון', 'בית משפט',
      (date_trunc('day', now() AT TIME ZONE 'Asia/Jerusalem') + interval '3 day' + time '09:30') AT TIME ZONE 'Asia/Jerusalem',
      (date_trunc('day', now() AT TIME ZONE 'Asia/Jerusalem') + interval '3 day' + time '10:30') AT TIME ZONE 'Asia/Jerusalem',
      false, 'יוסי כהן', 'עו״ד אמיר גולן', '#EF4444', $2, $6, 'hearing'),
     ($1, NULL, 'חופשה — דנה', 'הדגמת חופשה', NULL,
      (date_trunc('day', now() AT TIME ZONE 'Asia/Jerusalem') + interval '5 day') AT TIME ZONE 'Asia/Jerusalem',
      (date_trunc('day', now() AT TIME ZONE 'Asia/Jerusalem') + interval '6 day') AT TIME ZONE 'Asia/Jerusalem',
      true, NULL, 'עו״ד דנה שמש', '#718096', NULL, $4, 'leave'),
     ($1, $3, 'תזכורת מסמכים — כהן', 'להעלות מסמכים חסרים', NULL,
      (date_trunc('day', now() AT TIME ZONE 'Asia/Jerusalem') + interval '2 day' + time '16:00') AT TIME ZONE 'Asia/Jerusalem',
      (date_trunc('day', now() AT TIME ZONE 'Asia/Jerusalem') + interval '2 day' + time '16:30') AT TIME ZONE 'Asia/Jerusalem',
      false, 'יוסי כהן', 'עו״ד דנה שמש', '#3182CE', $2, $4, 'reminder')`,
    [adminId, clientId, caseIds[0], lawyerDana, caseIds[1], lawyerAmir]
  );

  console.log('[seed] reminders + notifications…');
  await db.query(
    `INSERT INTO reminder_templates (template_key, label, description, subject_template, body_html, created_by)
     VALUES (
       'melamedia_demo_docs',
       'תזכורת מסמכים — מלמדיה',
       'הדגמה',
       'תזכורת: מסמכים לתיק [[subject]]',
       'שלום [[client_name]],<br>נא להשלים מסמכים לתיק.<br>בברכה,<br>[[firm_name]]',
       $1
     )
     ON CONFLICT (template_key) DO UPDATE SET label = EXCLUDED.label, updated_at = now()`,
    [adminId]
  );
  await db.query(
    `INSERT INTO scheduled_email_reminders (
       user_id, client_name, to_email, subject, template_key, template_data, scheduled_for, status, created_by
     ) VALUES (
       $1, 'יוסי כהן', 'client1@example.com', 'תזכורת מסמכים — הדגמה',
       'melamedia_demo_docs', '{"subject":"רכישת דירה","client_name":"יוסי כהן","firm_name":"מלמדיה"}'::jsonb,
       now() + interval '2 days', 'PENDING', $2
     )`,
    [clientId, adminId]
  );

  await db.query(
    `INSERT INTO usernotifications (userid, title, message, isread, data) VALUES
     ($1, 'מסמך לחתימה', 'הסכם רכישה ממתין לחתימתך', false, '{"type":"signing"}'::jsonb),
     ($1, 'עדכון תיק', 'שלב חדש בתיק רכישת דירה', false, '{"type":"case"}'::jsonb),
     ($1, 'תזכורת פגישה', 'פגישת ייעוץ מחר ב־10:00', true, '{"type":"calendar"}'::jsonb),
     ($2, 'הדגמת אדמין', 'יש לקוח חדש / תיק פעיל להדגמה', false, '{"type":"admin"}'::jsonb)`,
    [clientId, adminId]
  );

  // Billing: copy plan definitions if empty, assign unlimited-ish PRO to admin tenant
  const planCount = Number((await db.query(`SELECT count(*)::int AS c FROM subscription_plans`)).rows[0].c);
  if (planCount === 0) {
    await db.query(`
      INSERT INTO subscription_plans (plan_key, name, users_quota, created_at, updated_at)
      VALUES
        ('BASIC', 'Basic', 3, now(), now()),
        ('PRO', 'Pro', 10, now(), now()),
        ('ENTERPRISE', 'Enterprise', NULL, now(), now())
      ON CONFLICT DO NOTHING
    `);
  }
  await db.query(
    `INSERT INTO tenant_subscriptions (tenant_id, plan_key, status, starts_at, updated_at, created_at)
     VALUES ($1, 'PRO', 'active', now(), now(), now())
     ON CONFLICT (tenant_id) DO UPDATE SET plan_key = 'PRO', status = 'active', updated_at = now()`,
    [adminId]
  );

  // Firm branding sanity
  await db.query(`
    UPDATE platform_settings SET setting_value = 'Melamedia', updated_at = now()
      WHERE category = 'firm' AND setting_key = 'COMPANY_NAME';
    UPDATE platform_settings SET setting_value = 'משרד עו"ד מלמדיה', updated_at = now()
      WHERE category = 'firm' AND setting_key = 'LAW_FIRM_NAME';
    UPDATE platform_settings SET setting_value = 'https://melamedia.mela-media.co.il/firm-logo.png?v=4', updated_at = now()
      WHERE category = 'firm' AND setting_key = 'FIRM_LOGO_URL';
  `);

  const summary = await db.query(`
    SELECT
      (SELECT count(*) FROM cases WHERE userid = $1) AS client_cases,
      (SELECT count(*) FROM casedescriptions) AS stage_notes,
      (SELECT count(*) FROM stage_files) AS stage_files,
      (SELECT count(*) FROM uploadedfiles) AS uploads,
      (SELECT count(*) FROM signingfiles) AS signing,
      (SELECT count(*) FROM signaturespots) AS spots,
      (SELECT count(*) FROM calendar_events) AS events,
      (SELECT count(*) FROM usernotifications WHERE userid = $1) AS client_notifs,
      (SELECT count(*) FROM casetypedescriptions) AS type_stages
  `, [clientId]);

  console.log('[seed] done', summary.rows[0]);
  await db.end();
}

main().catch((err) => {
  console.error('[seed] FAILED', err);
  process.exit(1);
});
