import { jerusalemParts } from './datetimeLocal';

/** Display date + time as DD.MM.YY · HH:MM in Asia/Jerusalem. */
export function DateDDMMYY_HHMM(dateString) {
    if (dateString == null || dateString === '') {
        return null;
    }

    const p = jerusalemParts(dateString);
    if (!p) return null;

    const day = String(p.day).padStart(2, '0');
    const month = String(p.month).padStart(2, '0');
    const year = String(p.year).slice(-2);
    const hour = String(p.hour).padStart(2, '0');
    const minute = String(p.minute).padStart(2, '0');

    return `${day}.${month}.${year} · ${hour}:${minute}`;
}
