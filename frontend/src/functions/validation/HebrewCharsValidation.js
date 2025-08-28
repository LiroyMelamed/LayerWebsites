export default function HebrewCharsValidation(input) {
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

export function HebrewCharsValidationWithNumbers(input) {
    const hebrewWithNumbersPattern = /^[א-ת0-9\s\+\-",'.\/]+$/;
    if (input == '' || input == null) return null;
    if (!hebrewWithNumbersPattern.test(input)) return 'הכנס אותיות בעברית ומספרים בלבד';
    return null;
}