import { jerusalemParts } from './datetimeLocal';

/** Display date as DD.MM.YY in Asia/Jerusalem (not browser local). */
export function DateDDMMYY(dateString) {
    if (dateString == null || dateString === '') {
        return null;
    }

    const p = jerusalemParts(dateString);
    if (!p) return null;

    const day = String(p.day).padStart(2, '0');
    const month = String(p.month).padStart(2, '0');
    const year = String(p.year).slice(-2);

    return `${day}.${month}.${year}`;
}
