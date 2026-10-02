import { useCallback, useImperativeHandle, useLayoutEffect, useRef, type RefObject } from 'react';
import type { ListImperativeAPI } from 'react-window';

// src/components/shared/useCustomSelectOptionFocus.ts — focus full-list indices after virtual rows mount.
export type CustomSelectMenuNavigation = { focusOption: (index: number) => void; cancelFocus: () => void };
type Options = { enabled: boolean; count: number; virtualized: boolean; menu: RefObject<HTMLDivElement | null>;
    list: RefObject<ListImperativeAPI | null>; navigation: RefObject<CustomSelectMenuNavigation | null> | undefined };

export function useCustomSelectOptionFocus({ enabled, count, virtualized, menu, list, navigation }: Options) {
    const pending = useRef<number | null>(null), frame = useRef(0);
    const cancelFocus = useCallback(() => {
        cancelAnimationFrame(frame.current); frame.current = 0; pending.current = null;
    }, []);
    // Scroll only the option viewport; never move a clipped settings panel or the page.
    const focusPending = useCallback(() => {
        if (pending.current === null || !menu.current) return;
        const button = menu.current.querySelector<HTMLButtonElement>(`[role="option"][data-option-index="${pending.current}"]`);
        if (!button) return;
        button.focus({ preventScroll: true });
        if (!virtualized) {
            const bounds = menu.current.getBoundingClientRect(), option = button.getBoundingClientRect();
            if (option.top < bounds.top + 6) menu.current.scrollTop -= bounds.top + 6 - option.top;
            if (option.bottom > bounds.bottom - 6) menu.current.scrollTop += option.bottom - bounds.bottom + 6;
        }
        pending.current = null;
    }, [menu, virtualized]);
    const scheduleFocus = useCallback(() => {
        if (pending.current === null || frame.current) return;
        frame.current = requestAnimationFrame(() => { frame.current = 0; focusPending(); });
    }, [focusPending]);
    useImperativeHandle(navigation, () => ({
        cancelFocus,
        focusOption(index: number) {
            cancelFocus();
            if (!enabled || index < 0 || index >= count) return;
            pending.current = index;
            if (virtualized) list.current?.scrollToRow({ index, align: 'smart', behavior: 'instant' });
            focusPending();
            scheduleFocus();
        },
    }), [enabled, count, virtualized, list, cancelFocus, focusPending, scheduleFocus]);
    useLayoutEffect(() => cancelFocus, [cancelFocus, enabled, count, virtualized]);
    return scheduleFocus;
}
