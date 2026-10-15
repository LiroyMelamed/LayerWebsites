import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { positionAnchoredMenu } from '../functions/dom/positionAnchoredMenu';

export function useAnchoredMenu(open, { align = 'end', onClose } = {}) {
    const anchorRef = useRef(null);
    const menuRef = useRef(null);

    const reposition = useCallback(() => {
        if (!open) return;
        positionAnchoredMenu({
            anchorEl: anchorRef.current,
            menuEl: menuRef.current,
            align,
        });
    }, [open, align]);

    useLayoutEffect(() => {
        if (!open) return undefined;
        reposition();

        window.addEventListener('resize', reposition);
        window.addEventListener('scroll', reposition, true);

        return () => {
            window.removeEventListener('resize', reposition);
            window.removeEventListener('scroll', reposition, true);
        };
    }, [open, reposition]);

    useEffect(() => {
        if (!open || !onClose) return undefined;

        const handlePointerDown = (event) => {
            const anchor = anchorRef.current;
            const menu = menuRef.current;
            if (anchor?.contains(event.target) || menu?.contains(event.target)) return;
            onClose();
        };

        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, [open, onClose]);

    return { anchorRef, menuRef, reposition };
}
