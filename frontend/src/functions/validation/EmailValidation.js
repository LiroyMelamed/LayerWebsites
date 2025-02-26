export default function emailValidation(email) {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // Simple email regex
    if (!email) return null;
    if (!emailPattern.test(email)) return 'אימייל לא תקין';
    return null; // No error
}