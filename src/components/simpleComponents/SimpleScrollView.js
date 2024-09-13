import React, { useRef, useState, useEffect } from "react";
import colors from "../../constant/colors";

const SimpleScrollView = React.forwardRef(({
    children,
    shouldScrollToEnd = false,
    onScroll,
    onScrollToTop,
    onScrollUp,
    onScrollDown,
    onScrollToBottom,
    ...props
}, ref) => {
    const internalScrollRef = useRef();
    const scrollRef = ref || internalScrollRef;

    const [isDragging, setIsDragging] = useState(false);
    const startY = useRef(0);
    const scrollStartTop = useRef(0);
    const velocityY = useRef(0);
    const lastTouchY = useRef(0);
    const momentumId = useRef(null);

    useEffect(() => {
        return () => {
            if (momentumId.current) {
                cancelAnimationFrame(momentumId.current);
            }
        };
    }, []);

    function handleOnScroll(event) {
        const { scrollTop, scrollHeight, clientHeight } = event.target;

        // Update scroll position state
        onScroll?.(event);

        if (scrollTop + clientHeight >= scrollHeight - 80) {
            onScrollToBottom?.(event);
        }
    }

    const handleTouchStart = (e) => {
        setIsDragging(true);
        startY.current = e.touches[0].pageY;
        scrollStartTop.current = scrollRef.current.scrollTop;
        lastTouchY.current = startY.current;
        velocityY.current = 0;

        if (momentumId.current) {
            cancelAnimationFrame(momentumId.current);
            momentumId.current = null;
        }
    };

    const handleTouchMove = (e) => {
        if (!isDragging) return;

        const moveY = e.touches[0].pageY;

        const diffY = moveY - lastTouchY.current;

        lastTouchY.current = moveY;

        velocityY.current = diffY;

        scrollRef.current.scrollTop = scrollStartTop.current - (moveY - startY.current);
    };

    const handleTouchEnd = () => {
        setIsDragging(false);
        applyMomentum();
    };

    const applyMomentum = () => {
        const scrollEl = scrollRef.current;
        const inertia = 0.95; // Deceleration factor

        const animateMomentum = () => {
            if (!scrollEl) return;

            if (Math.abs(velocityY.current) < 0.5) {
                return;
            }

            scrollEl.scrollTop += velocityY.current;

            velocityY.current *= inertia;

            momentumId.current = requestAnimationFrame(animateMomentum);
        };

        animateMomentum();
    };

    return (
        <div
            {...props}
            onScroll={handleOnScroll}
            ref={scrollRef}
            style={{
                overflowY: 'auto',
                overflowX: 'hidden',
                whiteSpace: 'normal',
                backgroundColor: colors.transparent,
                width: '100%',
                height: '100%',
                touchAction: 'none',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                '&::-webkit-scrollbar': {
                    display: 'none',
                },
                ...props.style,
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {children}
        </div>
    );
});

export default SimpleScrollView;
