const ExcelJS = require('exceljs');

/**
 * Parse an Excel (.xlsx) or CSV buffer into an array of row objects,
 * similar to the old `XLSX.utils.sheet_to_json(sheet, { defval: '' })`.
 *
 * @param {Buffer} buffer – file contents
 * @param {{ cellDates?: boolean }} _opts – ignored (ExcelJS parses dates natively)
 * @returns {Promise<{ sheetName: string|null, rows: Record<string,any>[] }>}
 */
async function parseExcelBuffer(buffer, _opts) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) return { sheetName: null, rows: [] };

    const sheetName = worksheet.name;
    const rows = [];
    const headers = [];

    worksheet.eachRow((row, rowNumber) => {
        const values = row.values; // 1-indexed array (index 0 is empty)
        if (rowNumber === 1) {
            for (let i = 1; i < values.length; i++) {
                headers.push(values[i] != null ? String(values[i]).trim() : `Column${i}`);
            }
            return;
        }
        const obj = {};
        for (let i = 0; i < headers.length; i++) {
            const val = values[i + 1];
            obj[headers[i]] = val != null ? val : '';
        }
        rows.push(obj);
    });

    return { sheetName, rows };
}

module.exports = { parseExcelBuffer };
