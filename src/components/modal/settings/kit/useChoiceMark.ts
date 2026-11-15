import { useLayoutEffect, useRef } from 'react';
import { kitTransition } from './motion';

// Keep one sliding mark in a choice's local coordinates, independent of window transforms and scrolling.
type MarkBox = { value: string | null; x: number; y: number; width: number; height: number };

export function useChoiceMark(value: string | null, options: readonly unknown[], reduced: boolean,
    targetSelector = ':scope > button[aria-pressed=true]', outset = 0) {
    const rootRef = useRef<HTMLDivElement>(null);
    const markRef = useRef<HTMLSpanElement>(null);
    const previous = useRef<MarkBox | null>(null);

    useLayoutEffect(() => {
        const root = rootRef.current, mark = markRef.current;
        if (!root || !mark) return;
        const measure = () => {
            const selected = root.querySelector<HTMLElement>(targetSelector);
            if (!selected || !root.offsetWidth || !root.offsetHeight) {
                mark.hidden = true;
                previous.current = null;
                return;
            }
            const bounds = root.getBoundingClientRect(), target = selected.getBoundingClientRect();
            const style = getComputedStyle(root);
            const scaleX = bounds.width / (parseFloat(style.width) || root.offsetWidth);
            const scaleY = bounds.height / (parseFloat(style.height) || root.offsetHeight);
            if (!scaleX || !scaleY) return;
            const next: MarkBox = { value, x: (target.left - bounds.left) / scaleX - root.clientLeft + root.scrollLeft - outset,
                y: (target.top - bounds.top) / scaleY - root.clientTop + root.scrollTop - outset,
                width: target.width / scaleX + outset * 2, height: target.height / scaleY + outset * 2 };
            const before = previous.current;
            if (reduced) mark.style.transition = 'none';
            if (before && before.value === value && (['x', 'y', 'width', 'height'] as const)
                .every(key => Math.abs(before[key] - next[key]) < 0.01)) return;
            const transition = kitTransition('move', reduced);
            const timing = `${transition.duration}s cubic-bezier(${transition.ease.join(',')})`;
            mark.style.transition = before && before.value !== value
                ? `transform ${timing}, width ${timing}, height ${timing}` : 'none';
            mark.style.width = `${next.width}px`;
            mark.style.height = `${next.height}px`;
            mark.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`;
            mark.hidden = false;
            previous.current = next;
        };
        measure();
        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(measure);
        observer.observe(root);
        root.querySelectorAll('button').forEach(button => observer.observe(button));
        return () => observer.disconnect();
    }, [value, options, reduced, targetSelector, outset]);

    return { rootRef, markRef };
}
