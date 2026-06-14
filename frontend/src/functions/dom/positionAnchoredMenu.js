/**
 * Position a floating menu relative to an anchor, flipping above when there
 * is not enough room below (common in sidebar / mobile webview).
 */
export function positionAnchoredMenu({
    anchorEl,
    menuEl,
    margin = 8,
    gap = 4,
    align = 'end',
}) {
    if (!anchorEl || !menuEl) return { placement: 'below' };

    const anchorRect = anchorEl.getBoundingClientRect();
    const menuWidth = menuEl.offsetWidth || menuEl.getBoundingClientRect().width;
    const menuHeight = menuEl.offsetHeight || menuEl.getBoundingClientRect().height;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const spaceBelow = viewportHeight - anchorRect.bottom - margin;
    const spaceAbove = anchorRect.top - margin;

    let placement = 'below';
    if (spaceBelow < menuHeight + gap && spaceAbove > spaceBelow) {
        placement = 'above';
    }

    let top;
    if (placement === 'below') {
        top = anchorRect.bottom + gap;
        if (top + menuHeight > viewportHeight - margin) {
            top = Math.max(margin, viewportHeight - menuHeight - margin);
        }
    } else {
        top = anchorRect.top - menuHeight - gap;
        if (top < margin) {
            top = margin;
        }
    }

    const isRtl = document.documentElement.dir === 'rtl';
    let left;
    if (align === 'end') {
        left = isRtl ? anchorRect.left : anchorRect.right - menuWidth;
    } else if (align === 'start') {
        left = isRtl ? anchorRect.right - menuWidth : anchorRect.left;
    } else {
        left = anchorRect.left + anchorRect.width / 2 - menuWidth / 2;
    }

    left = Math.max(margin, Math.min(left, viewportWidth - menuWidth - margin));

    menuEl.style.position = 'fixed';
    menuEl.style.top = `${top}px`;
    menuEl.style.left = `${left}px`;
    menuEl.style.right = 'auto';
    menuEl.style.bottom = 'auto';
    menuEl.style.insetInlineEnd = 'auto';
    menuEl.style.maxHeight = `${Math.max(120, viewportHeight - margin * 2)}px`;
    menuEl.style.overflowY = 'auto';

    return { placement, top, left };
}
