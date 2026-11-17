// Display only. Never use the joined value as an SMS recipient or stored phone.
export function caseClientPhones(record) {
    const people = Array.isArray(record?.Users) ? record.Users : [];
    const values = people.length ? people.map(person => person.PhoneNumber) : [record?.PhoneNumber];
    const seen = new Set();
    return values.map(value => String(value || '').trim()).filter(value => {
        const key = value.replace(/[\s()-]/g, '').replace(/^\+972/, '0');
        if (!key || seen.has(key)) return false;
        seen.add(key); return true;
    });
}
