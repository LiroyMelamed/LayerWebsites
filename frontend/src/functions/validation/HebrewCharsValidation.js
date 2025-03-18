export default function HebrewCharsValidation(input) {
    console.log('HebrewCharsValidation', input);

    const hebrewPattern = /^[א-ת\s\+\-",'.\/]+$/;
    if (!input) return null;
    if (!hebrewPattern.test(input)) return 'הכנס אותיות בעברית בלבד';
    return null;
}

export function HebrewCharsValidationWithNULL(input) {
    const hebrewPattern = /^[א-ת\s\+\-",'.\/]+$/;
    if (input == '' || input == "" || input == null) return null;
    if (!hebrewPattern.test(input)) return 'הכנס אותיות בעברית בלבד';
    return null;
}