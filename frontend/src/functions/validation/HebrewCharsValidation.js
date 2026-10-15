import i18next from 'i18next';

export default function HebrewCharsValidation(input) {
    const hebrewPattern = /^[\u05D0-\u05EA\s\+\-",'.\/]+$/;
    if (!input) return null;
    if (!hebrewPattern.test(input)) return i18next.t('errors.hebrewOnly');
    return null;
}

export function HebrewCharsValidationWithNULL(input) {
    const hebrewPattern = /^[\u05D0-\u05EA\s\+\-",'.\/]+$/;
    if (input == '' || input == "" || input == null) return null;
    if (!hebrewPattern.test(input)) return i18next.t('errors.hebrewOnly');
    return null;
}

export function HebrewCharsValidationWithNumbers(input) {
    const hebrewWithNumbersPattern = /^[\u05D0-\u05EA0-9\s\+\-",'.\/]+$/;
    if (input == '' || input == null) return null;
    if (!hebrewWithNumbersPattern.test(input)) return i18next.t('errors.hebrewAndNumbersOnly');
    return null;
}