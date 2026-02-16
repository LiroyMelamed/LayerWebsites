/**
 * Generate demo Excel templates in frontend/public/templates/
 * Run once: node scripts/generate-demo-excels.js
 */
const XLSX = require('../backend/node_modules/xlsx');
const path = require('path');

const outDir = path.join(__dirname, '..', 'frontend', 'public', 'templates');

// ── Reminders demo ──────────────────────────────────────────────────
const remindersData = [
    { 'שם לקוח': 'ישראל ישראלי', 'אימייל': 'israel@example.com', 'תאריך': '2026-03-01', 'נושא': 'תזכורת לפגישה', 'הערות': 'פגישה משרדית' },
    { 'שם לקוח': 'רחל כהן', 'אימייל': 'rachel@example.com', 'תאריך': '2026-03-15', 'נושא': '', 'הערות': '' },
    { 'שם לקוח': 'דוד לוי', 'אימייל': 'david@example.com', 'תאריך': '2026-04-01', 'נושא': 'חידוש מסמכים', 'הערות': 'יש לצרף אישור' },
];

const remindersWb = XLSX.utils.book_new();
const remindersSh = XLSX.utils.json_to_sheet(remindersData);
// Set column widths
remindersSh['!cols'] = [
    { wch: 18 }, // שם לקוח
    { wch: 24 }, // אימייל
    { wch: 14 }, // תאריך
    { wch: 20 }, // נושא
    { wch: 22 }, // הערות
];
XLSX.utils.book_append_sheet(remindersWb, remindersSh, 'תזכורות');
XLSX.writeFile(remindersWb, path.join(outDir, 'reminders-demo.xlsx'));
console.log('Created reminders-demo.xlsx');

// ── Clients demo ────────────────────────────────────────────────────
const clientsData = [
    { 'שם': 'ישראל ישראלי', 'טלפון': '050-1234567', 'אימייל': 'israel@example.com', 'ת.ז': '012345678', 'הערות': 'לקוח חדש' },
    { 'שם': 'רחל כהן', 'טלפון': '052-9876543', 'אימייל': 'rachel@example.com', 'ת.ז': '', 'הערות': '' },
    { 'שם': 'דוד לוי', 'טלפון': '054-5555555', 'אימייל': 'david@example.com', 'ת.ז': '987654321', 'הערות': 'VIP' },
];

const clientsWb = XLSX.utils.book_new();
const clientsSh = XLSX.utils.json_to_sheet(clientsData);
clientsSh['!cols'] = [
    { wch: 18 }, // שם
    { wch: 14 }, // טלפון
    { wch: 24 }, // אימייל
    { wch: 12 }, // ת.ז
    { wch: 18 }, // הערות
];
XLSX.utils.book_append_sheet(clientsWb, clientsSh, 'לקוחות');
XLSX.writeFile(clientsWb, path.join(outDir, 'clients-demo.xlsx'));
console.log('Created clients-demo.xlsx');
