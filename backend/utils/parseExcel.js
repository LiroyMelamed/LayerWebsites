const ExcelJS = require('exceljs');

/**
 * Parse an Excel (.xlsx) or CSV buffer into an array of row objects,
 * similar to the old `XLSX.utils.sheet_to_json(sheet, { defval: '' })`.
 *
 * @param {Buffer} buffer – file contents
 * @param {{ cellDates?: boolean }} _opts – ignored (ExcelJS parses dates natively)
 * @returns {Promise<{ sheetName: string|null, rows: Record<string,any>[] }>}
 */
/**
 * Unwrap ExcelJS cell values that may be rich-text or hyperlink objects
 * into plain scalar values.
 */
function _unwrapCellValue(val) {
    if (val == null) return '';
    // Hyperlink object: { text: '...', hyperlink: 'mailto:...' }
    if (typeof val === 'object' && val.text != null) return val.text;
    // Rich-text array: { richText: [{ text: '...' }, ...] }
    if (typeof val === 'object' && Array.isArray(val.richText)) {
        return val.richText.map(r => r.text || '').join('');
    }
    // ExcelJS formula result: { result: ... }
    if (typeof val === 'object' && 'result' in val) return val.result ?? '';
    return val;
}

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
                const v = _unwrapCellValue(values[i]);
                headers.push(v ? String(v).trim() : `Column${i}`);
            }
            return;
        }
        const obj = {};
        let hasData = false;
        for (let i = 0; i < headers.length; i++) {
            const val = _unwrapCellValue(values[i + 1]);
            obj[headers[i]] = val;
            if (val !== '' && val != null) hasData = true;
        }
        // Skip completely empty rows
        if (hasData) rows.push(obj);
    });

    return { sheetName, rows };
}

module.exports = { parseExcelBuffer };
