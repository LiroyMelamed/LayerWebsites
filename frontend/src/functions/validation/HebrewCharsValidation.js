export default function HebrewCharsValidation(input) {
    const hebrewPattern = /^[א-ת\s]+$/;
    if (!input) return null;
    if (!hebrewPattern.test(input)) return 'הכנס אותיות בעברית בלבד';
    return null; // No error
}