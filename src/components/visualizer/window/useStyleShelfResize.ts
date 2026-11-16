import { useCallback, useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';

// Resizes the studio's style shelf without rendering React on pointer moves or window resizes.
const HANDLE_HEIGHT = 24;
const MIN_SHELF_HEIGHT = 136;
const SETTINGS_HEIGHT = 220;

export const styleShelfBounds = (containerHeight: number) => {
    const available = Math.max(0, containerHeight - HANDLE_HEIGHT);
    const max = Math.max(0, Math.floor(available - Math.min(SETTINGS_HEIGHT, containerHeight * 0.45)));
    return { min: Math.min(MIN_SHELF_HEIGHT, max), max };
};

interface ShelfDrag {
    pointerId: number;
    startY: number;
    startHeight: number;
    scale: number;
}

/** Keeps a preferred height for this open studio, clamped so the settings below remain usable. */
export const useStyleShelfResize = (enabled: boolean) => {
    const shelfRef = useRef<HTMLDivElement>(null);
    const handleRef = useRef<HTMLDivElement>(null);
    const preferredHeight = useRef<number | null>(null);
    const drag = useRef<ShelfDrag | null>(null);

    const applyHeight = useCallback((wanted?: number, remember = false) => {
        const shelf = shelfRef.current;
        const handle = handleRef.current;
        const parent = shelf?.parentElement;
        if (!shelf || !handle || !parent) return 0;
        const bounds = styleShelfBounds(parent.clientHeight);
        const next = Math.round(Math.min(bounds.max, Math.max(bounds.min, wanted ?? preferredHeight.current ?? parent.clientHeight * 0.42)));
        if (remember) preferredHeight.current = next;
        shelf.style.setProperty('--st-style-shelf-height', `${next}px`);
        handle.setAttribute('aria-valuemin', String(bounds.min));
        handle.setAttribute('aria-valuemax', String(bounds.max));
        handle.setAttribute('aria-valuenow', String(next));
        return next;
    }, []);

    const finishDrag = useCallback(() => {
        const held = drag.current;
        drag.current = null;
        const handle = handleRef.current;
        if (!handle) return;
        delete handle.dataset.resizing;
        if (held && handle.hasPointerCapture?.(held.pointerId)) handle.releasePointerCapture(held.pointerId);
    }, []);

    useLayoutEffect(() => {
        if (!enabled) return;
        const parent = shelfRef.current?.parentElement;
        if (!parent) return;
        applyHeight();
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => applyHeight());
        observer?.observe(parent);
        window.addEventListener('blur', finishDrag);
        return () => {
            observer?.disconnect();
            window.removeEventListener('blur', finishDrag);
            finishDrag();
        };
    }, [enabled, applyHeight, finishDrag]);

    const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0 || event.isPrimary === false) return;
        const shelf = shelfRef.current;
        if (!shelf) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture?.(event.pointerId);
        event.currentTarget.dataset.resizing = '';
        drag.current = {
            pointerId: event.pointerId,
            startY: event.clientY,
            startHeight: shelf.offsetHeight,
            // The host may scale the whole studio; pointer coordinates are outside that scale.
            scale: shelf.offsetHeight > 0 ? shelf.getBoundingClientRect().height / shelf.offsetHeight || 1 : 1,
        };
    };
    const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
        const held = drag.current;
        if (!held || held.pointerId !== event.pointerId) return;
        applyHeight(held.startHeight + (event.clientY - held.startY) / held.scale, true);
    };
    const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
        if (drag.current?.pointerId === event.pointerId) finishDrag();
    };
    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        const parent = shelfRef.current?.parentElement;
        if (!parent) return;
        const { min, max } = styleShelfBounds(parent.clientHeight);
        const step = event.shiftKey ? 48 : 16;
        const change = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
        if (!change && event.key !== 'Home' && event.key !== 'End') return;
        event.preventDefault();
        event.stopPropagation();
        applyHeight(event.key === 'Home' ? min : event.key === 'End' ? max : (shelfRef.current?.offsetHeight ?? min) + change, true);
    };

    return { shelfRef, handleRef, onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd, onLostPointerCapture: onPointerEnd, onKeyDown };
};
