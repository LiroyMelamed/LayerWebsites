import React, { useEffect, useState } from 'react';
import SimpleContainer from '../../../simpleComponents/SimpleContainer';
import { useTranslation } from 'react-i18next';
import './fieldToolbar.scss';

// containerSelector: CSS selector for the pdf viewer container (e.g. .lw-signing-pdfViewer)
export default function FloatingAddField({ onAdd = () => { }, containerSelector = '.lw-signing-pdfViewer', currentPage }) {
    const { t } = useTranslation();
    const [visiblePage, setVisiblePage] = useState(Number(currentPage) || 1);

    useEffect(() => {
        if (Number.isFinite(currentPage)) {
            setVisiblePage(Number(currentPage) || 1);
        }
    }, [containerSelector, currentPage]);

    const findScrollParent = (el) => {
        let cur = el;
        while (cur && cur !== document.body) {
            const style = window.getComputedStyle(cur);
            const overflowY = style?.overflowY;
            if ((overflowY === 'auto' || overflowY === 'scroll') && cur.scrollHeight > cur.clientHeight + 2) {
                return cur;
            }
            cur = cur.parentElement;
        }
        return null;
    };

    const handleAddClick = () => {
        const pageNumber = Number(currentPage) || Number(visiblePage) || 1;
        const container = document.querySelector(containerSelector);
        const pageEl = container?.querySelector(`[data-page-number="${pageNumber}"]`);
        if (!container || !pageEl) {
            onAdd(pageNumber);
            return;
        }

        const pageRect = pageEl.getBoundingClientRect();
        const scrollParent = findScrollParent(container);
        const viewportRect = scrollParent
            ? scrollParent.getBoundingClientRect()
            : { top: 0, height: window.innerHeight || document.documentElement.clientHeight || 0 };

        const centerY = viewportRect.top + viewportRect.height / 2;
        const relativeY = Math.max(0, Math.min(centerY - pageRect.top, pageRect.height));
        const yRatio = pageRect.height > 0 ? relativeY / pageRect.height : 0.2;

        onAdd(pageNumber, { yRatio });
    };

    return (
        <SimpleContainer className="lw-floatingAddField">
            <button
                type="button"
                className="lw-floatingAddField__btn"
                onClick={handleAddClick}
                title={t('signing.fieldSettings.addFieldForPage', { page: visiblePage })}
            >
                +
            </button>
        </SimpleContainer>
    );
}
