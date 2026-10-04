import { useLayoutEffect, useState, type RefObject } from 'react';
import type { CustomSelectMenuPosition } from './CustomSelectMenu';

// src/components/shared/useCustomSelectPosition.ts — viewport placement shared by normal and glass selects.
type Options = { open: boolean; container: RefObject<HTMLDivElement | null>; menu: RefObject<HTMLDivElement | null>;
    minWidth: number; getClipElement?: () => HTMLElement | null; getAnchorElement?: () => HTMLElement | null; close: () => void };
const GAP = 4, GUTTER = 8, MAX_HEIGHT = 240, MIN_HEIGHT = 160;

export function useCustomSelectPosition({ open, container, menu, minWidth, getClipElement, getAnchorElement, close }: Options) {
    const [position, setPosition] = useState<CustomSelectMenuPosition | null>(null);
    useLayoutEffect(() => {
        if (!open) { setPosition(null); return; }
        let frame = 0;
        // Reposition only an open menu, skip its own scroll, and compare geometry before updating React.
        const update = () => {
            const element = getAnchorElement?.() ?? container.current;
            if (!element) return;
            const rect = element.getBoundingClientRect(), clip = getClipElement?.()?.getBoundingClientRect();
            if (clip && (rect.bottom <= clip.top || rect.top >= clip.bottom || rect.right <= clip.left || rect.left >= clip.right)) { close(); return; }
            const below = window.innerHeight - rect.bottom - GAP - GUTTER, above = rect.top - GAP - GUTTER;
            const placement = Math.max(above, below) < MIN_HEIGHT ? 'viewport' : below < MIN_HEIGHT && above > below ? 'top' : 'bottom';
            const available = placement === 'viewport' ? window.innerHeight - GUTTER * 2 : placement === 'top' ? above : below;
            const width = Math.min(Math.max(rect.width, minWidth), window.innerWidth - GUTTER * 2);
            const next: CustomSelectMenuPosition = {
                left: Math.max(GUTTER, Math.min(rect.left, window.innerWidth - width - GUTTER)), width,
                maxHeight: Math.max(72, placement === 'viewport' ? available : Math.min(MAX_HEIGHT, available)), placement,
                ...(placement === 'viewport' ? { top: GUTTER } : placement === 'top' ? { bottom: window.innerHeight - rect.top + GAP } : { top: rect.bottom + GAP }),
            };
            setPosition(previous => previous && previous.left === next.left && previous.width === next.width && previous.maxHeight === next.maxHeight
                && previous.placement === next.placement && previous.top === next.top && previous.bottom === next.bottom ? previous : next);
        };
        const schedule = (event: Event) => {
            if (event.target instanceof Node && menu.current?.contains(event.target)) return;
            if (!frame) frame = requestAnimationFrame(() => { frame = 0; update(); });
        };
        const clipElement = getClipElement?.();
        // A menu opened during its panel's entrance follows the panel's settled anchor once.
        const finishEntrance = (event: AnimationEvent) => { if (event.target === clipElement) schedule(event); };
        clipElement?.addEventListener('animationend', finishEntrance);
        update(); window.addEventListener('resize', schedule); window.addEventListener('scroll', schedule, true);
        return () => { cancelAnimationFrame(frame); clipElement?.removeEventListener('animationend', finishEntrance);
            window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true); };
    }, [open, container, menu, minWidth, getClipElement, getAnchorElement, close]);
    return position;
}
