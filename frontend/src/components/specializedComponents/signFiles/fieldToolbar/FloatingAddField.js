import React, { useEffect, useState } from 'react';
import SimpleContainer from '../../../simpleComponents/SimpleContainer';
import { useTranslation } from 'react-i18next';
import './fieldToolbar.scss';

// containerSelector: CSS selector for the pdf viewer container (e.g. .lw-signing-pdfViewer)
export default function FloatingAddField({ onAdd = () => {}, containerSelector = '.lw-signing-pdfViewer' }) {
    const { t } = useTranslation();
    const [visiblePage, setVisiblePage] = useState(1);

    useEffect(() => {
        const container = document.querySelector(containerSelector);
        if (!container) return;

        const pages = () => Array.from(container.querySelectorAll('[data-page-number]'));

        const update = () => {
            const els = pages();
            if (!els.length) return;
            // Find page whose center is closest to container center
            const rect = container.getBoundingClientRect();
            const centerY = rect.top + rect.height / 2;
            let best = { el: els[0], dist: Infinity };
            els.forEach((el) => {
                const r = el.getBoundingClientRect();
                const elCenter = r.top + r.height / 2;
                const d = Math.abs(elCenter - centerY);
                if (d < best.dist) best = { el, dist: d };
            });
            const pn = Number(best.el.getAttribute('data-page-number')) || 1;
            setVisiblePage(pn);
        };

        update();
        container.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update);
        return () => {
            container.removeEventListener('scroll', update);
            window.removeEventListener('resize', update);
        };
    }, [containerSelector]);

    return (
        <SimpleContainer className="lw-floatingAddField">
            <button
                type="button"
                className="lw-floatingAddField__btn"
                onClick={() => onAdd(visiblePage)}
                title={t('signing.fieldSettings.addFieldForPage', { page: visiblePage })}
            >
                +
            </button>
        </SimpleContainer>
    );
}
