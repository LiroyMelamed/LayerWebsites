import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { setLanguage } from '../../i18n/i18n';
import { useAnchoredMenu } from '../../hooks/useAnchoredMenu';
import './LanguageSwitcher.scss';

const ENABLE_ENGLISH_OPTION = false;

export default function LanguageSwitcher() {
    const { i18n, t } = useTranslation();
    const [open, setOpen] = useState(false);
    const { anchorRef, menuRef } = useAnchoredMenu(open, {
        align: 'end',
        onClose: () => setOpen(false),
    });

    const current = useMemo(() => {
        const lng = String(i18n.language || 'he');
        if (lng.startsWith('ar')) return 'ar';
        if (lng.startsWith('en')) return 'en';
        return 'he';
    }, [i18n.language]);

    async function choose(lng) {
        setOpen(false);
        await setLanguage(lng);
    }

    return (
        <div className="lw-languageSwitcher">
            <button
                ref={anchorRef}
                type="button"
                className="lw-languageSwitcher__button"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
            >
                {t('common.language')}: {current === 'he' ? t('common.hebrew') : current === 'ar' ? t('common.arabic') : t('common.english')}
            </button>

            {open && createPortal(
                <div ref={menuRef} className="lw-languageSwitcher__menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => choose('he')}>
                        {t('common.hebrew')}
                    </button>
                    <button type="button" role="menuitem" onClick={() => choose('ar')}>
                        {t('common.arabic')}
                    </button>
                    {ENABLE_ENGLISH_OPTION && (
                        <button type="button" role="menuitem" onClick={() => choose('en')}>
                            {t('common.english')}
                        </button>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
}
