import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const LOCALES = { he: 'he-IL', ar: 'ar-IL', en: 'en-GB' };

export default function useSigningLocale() {
    const { t, i18n } = useTranslation();
    const language = String(i18n.resolvedLanguage || i18n.language || 'he').split('-')[0];
    const locale = LOCALES[language] || LOCALES.he;
    const formats = useMemo(() => ({
        number: new Intl.NumberFormat(locale),
        date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }),
    }), [locale]);
    return {
        t, language, locale, direction: i18n.dir(language),
        number: value => formats.number.format(Number(value || 0)),
        date: value => value && Number.isFinite(new Date(value).getTime()) ? formats.date.format(new Date(value)) : t('signingV2.notYet'),
        errorMessage: error => {
            const key = `signingV2.errors.${error?.code || ''}`;
            return i18n.exists(key) ? t(key) : t('signingV2.errors.REQUEST_FAILED');
        },
    };
}
