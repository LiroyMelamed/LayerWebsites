const ExcelJS = require('exceljs');
(async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(['name', 'email', 'firm']);
  ws.addRow(['עו"ד לירוי מלמד', 'liroymelamed@icloud.com', 'משרד לדוגמה']);
  await wb.xlsx.writeFile('/tmp/brevo-test.xlsx');
  console.log('wrote /tmp/brevo-test.xlsx');
})();
