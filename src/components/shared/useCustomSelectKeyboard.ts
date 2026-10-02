import { useLayoutEffect, useRef, type KeyboardEvent, type RefObject } from 'react';
import type { CustomSelectOption } from './CustomSelectMenu';
import type { CustomSelectMenuNavigation } from './useCustomSelectOptionFocus';

// src/components/shared/useCustomSelectKeyboard.ts — optional listbox navigation with predictable focus restoration.
type Options = { enabled: boolean; open: boolean; ready: boolean; value: string; options: CustomSelectOption[];
    navigation: RefObject<CustomSelectMenuNavigation | null>;
    trigger: RefObject<HTMLButtonElement | null>; show: () => void; close: () => void };
export function useCustomSelectKeyboard({ enabled, open, ready, value, options, navigation, trigger, show, close }: Options) {
    const first = useRef<'selected' | 'first' | 'last'>('selected');
    const search = useRef({ text: '', time: 0 });
    const active = useRef(0);
    // Keep logical navigation independent of the rows currently mounted by react-window.
    const focus = (index: number) => {
        if (index < 0 || index >= options.length) return;
        active.current = index;
        // Moving focus before scrolling prevents an unmounted option from blurring the select closed.
        trigger.current?.focus({ preventScroll: true });
        navigation.current?.focusOption(index);
    };
    useLayoutEffect(() => {
        if (!enabled || !open || !ready) return;
        search.current = { text: '', time: 0 };
        const selected = options.findIndex(option => option.value === value);
        focus(first.current === 'first' ? 0 : first.current === 'last' ? options.length - 1 : Math.max(0, selected));
        first.current = 'selected';
    }, [enabled, open, ready]);
    return (event: KeyboardEvent<HTMLElement>) => {
        if (!enabled) return;
        if (open && event.key === 'Escape') {
            event.preventDefault(); event.stopPropagation(); close(); trigger.current?.focus({ preventScroll: true }); return;
        }
        if (open && event.key === 'Tab') { close(); trigger.current?.focus({ preventScroll: true }); return; }
        const direction = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
        if (!open && (direction || event.key === 'Home' || event.key === 'End')) {
            event.preventDefault(); first.current = event.key === 'Home' ? 'first' : event.key === 'End' ? 'last' : 'selected'; show(); return;
        }
        if (!open) return;
        if (!options.length) return;
        const focused = document.activeElement?.getAttribute('data-option-index');
        const index = focused === null || focused === undefined ? active.current : Number(focused);
        if (direction || event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            focus(event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + direction + options.length) % options.length);
        } else if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.altKey && !event.metaKey) {
            const now = performance.now(); search.current = { text: (now - search.current.time < 800 ? search.current.text : '') + event.key.toLocaleLowerCase(), time: now };
            const match = options.findIndex(option => option.label.trim().toLocaleLowerCase().startsWith(search.current.text));
            if (match >= 0) { event.preventDefault(); focus(match); }
        }
    };
}
