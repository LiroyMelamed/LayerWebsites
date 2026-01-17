import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setLanguage } from '../../i18n/i18n';
import './FloatingLanguageBubble.scss';

const ENABLE_ENGLISH_OPTION = false;

export default function FloatingLanguageBubble() {
    const { i18n, t } = useTranslation();
    const [open, setOpen] = useState(false);

    const current = useMemo(() => {
        const lng = String(i18n.language || 'he');
        if (lng.startsWith('ar')) return 'ar';
        if (lng.startsWith('en')) return 'en';
        return 'he';
    }, [i18n.language]);

    const options = useMemo(() => {
        const base = [
            { code: 'he', label: t('common.hebrew') },
            { code: 'ar', label: t('common.arabic') },
        ];
        if (ENABLE_ENGLISH_OPTION) {
            base.push({ code: 'en', label: t('common.english') });
        }
        return base;
    }, [t]);

    async function choose(lng) {
        setOpen(false);
        await setLanguage(lng);
    }

    return (
        <div className="lw-floatingLanguageBubble">
            <button
                type="button"
                className="lw-floatingLanguageBubble__button"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
            >
                {t('common.language')}
            </button>

            {open && (
                <div className="lw-floatingLanguageBubble__menu" role="menu">
                    {options.map((opt) => (
                        <button
                            key={opt.code}
                            type="button"
                            role="menuitem"
                            onClick={() => choose(opt.code)}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
