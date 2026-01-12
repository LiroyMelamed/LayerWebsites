import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import he from './locales/he.json';
import ar from './locales/ar.json';
import en from './locales/en.json';

const STORAGE_KEY = 'ml_lang';

function getInitialLanguage() {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (raw === 'he' || raw === 'ar' || raw === 'en') return raw;
    return 'he';
}

function applyDocumentDirection(lng) {
    if (typeof document === 'undefined' || !document.documentElement) return;

    document.documentElement.lang = lng;
    document.documentElement.dir = lng === 'en' ? 'ltr' : 'rtl';
}

const initialLng = getInitialLanguage();
applyDocumentDirection(initialLng);

void i18n
    .use(initReactI18next)
    .init({
        resources: {
            he: { translation: he },
            ar: { translation: ar },
            en: { translation: en },
        },
        lng: initialLng,
        fallbackLng: 'he',
        interpolation: {
            escapeValue: false,
        },
    });

export async function setLanguage(lng) {
    if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, lng);
    }

    applyDocumentDirection(lng);
    await i18n.changeLanguage(lng);
}

export default i18n;
