const { formatPhoneNumber } = require('../utils/phoneUtils');

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizePhone = (value) => formatPhoneNumber(value) || String(value || '').replace(/\D/g, '');

// Signing screens may select a customer, never rewrite that customer's identity.
// Accept unchanged fields from older clients, including equivalent phone formats.
function hasSigningContactOverride(input, customer) {
    return (input.email !== undefined && normalizeEmail(input.email) !== normalizeEmail(customer.Email))
        || (input.phone !== undefined && normalizePhone(input.phone) !== normalizePhone(customer.Phone));
}

const CONTACT_EDIT_MESSAGE = 'פרטי הקשר אינם תואמים ללקוח שנבחר. לשינוי אימייל או טלפון יש לעדכן את כרטיס הלקוח במסך הלקוחות ולבחור אותו מחדש.';

module.exports = { hasSigningContactOverride, CONTACT_EDIT_MESSAGE };
