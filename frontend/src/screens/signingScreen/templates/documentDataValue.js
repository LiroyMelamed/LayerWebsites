// Display dates without a timezone shift; preserve exact identifiers and decimal strings.
export default function documentDataValue(field, value, { t, locale }) {
    if (typeof value === 'boolean') return t(`signingV2.compose.data.${value ? 'yes' : 'no'}`);
    if (field.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value || '')) {
        const day = new Date(`${value}T00:00:00Z`);
        if (Number.isFinite(day.getTime())) return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(day);
    }
    return value;
}
