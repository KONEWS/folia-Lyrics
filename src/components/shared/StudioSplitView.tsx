import { useCallback, useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { GripVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// A movable boundary shares the desktop studio between its live preview and settings column.
const HANDLE_WIDTH = 12;
const widthBounds = (width: number) => {
    const min = Math.min(260, width * 0.55);
    return { min, max: Math.max(min, width - HANDLE_WIDTH - Math.min(220, width * 0.25)) };
};

export default function StudioSplitView({ stage, children }: { stage: ReactNode; children: ReactNode }) {
    const { t } = useTranslation();
    const container = useRef<HTMLDivElement>(null);
    const options = useRef<HTMLElement>(null);
    const handle = useRef<HTMLDivElement>(null);
    const preferred = useRef<number | null>(null);
    const drag = useRef<{ id: number; x: number; width: number; scale: number } | null>(null);
    const applyWidth = useCallback((wanted?: number, remember = false) => {
        const box = container.current;
        if (!box || !handle.current) return;
        const { min, max } = widthBounds(box.clientWidth);
        const next = Math.round(Math.max(min, Math.min(max, wanted ?? preferred.current ?? box.clientWidth * 0.4)));
        if (remember) preferred.current = next;
        box.style.setProperty('--studio-options-width', `${next}px`);
        handle.current.setAttribute('aria-valuemin', String(Math.round(min)));
        handle.current.setAttribute('aria-valuemax', String(Math.round(max)));
        handle.current.setAttribute('aria-valuenow', String(next));
    }, []);
    const finish = useCallback(() => {
        const held = drag.current;
        drag.current = null;
        if (!handle.current) return;
        delete handle.current.dataset.resizing;
        if (held && handle.current.hasPointerCapture?.(held.id)) handle.current.releasePointerCapture(held.id);
    }, []);
    useLayoutEffect(() => {
        const box = container.current;
        if (!box) return;
        applyWidth();
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => applyWidth());
        observer?.observe(box);
        window.addEventListener('blur', finish);
        return () => { observer?.disconnect(); window.removeEventListener('blur', finish); finish(); };
    }, [applyWidth, finish]);
    const start = (event: PointerEvent<HTMLDivElement>) => {
        const box = container.current;
        if (event.button !== 0 || event.isPrimary === false || !box || !options.current) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture?.(event.pointerId);
        event.currentTarget.dataset.resizing = '';
        drag.current = { id: event.pointerId, x: event.clientX, width: options.current.offsetWidth,
            scale: box.offsetWidth > 0 ? box.getBoundingClientRect().width / box.offsetWidth || 1 : 1 };
    };
    const move = (event: PointerEvent<HTMLDivElement>) => {
        const held = drag.current;
        if (held?.id === event.pointerId) applyWidth(held.width - (event.clientX - held.x) / held.scale, true);
    };
    const end = (event: PointerEvent<HTMLDivElement>) => { if (drag.current?.id === event.pointerId) finish(); };
    const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.altKey || event.ctrlKey || event.metaKey || !container.current) return;
        const change = event.key === 'ArrowLeft' ? 1 : event.key === 'ArrowRight' ? -1 : 0;
        if (!change && event.key !== 'Home' && event.key !== 'End') return;
        event.preventDefault(); event.stopPropagation();
        const { min, max } = widthBounds(container.current.clientWidth);
        applyWidth(event.key === 'Home' ? min : event.key === 'End' ? max
            : (options.current?.offsetWidth ?? min) + change * (event.shiftKey ? 48 : 16), true);
    };
    return <div ref={container} data-studio-split className="grid min-h-0 min-w-0 overflow-hidden pt-2"
        style={{ gridTemplateColumns: 'minmax(0, 1fr) 12px var(--studio-options-width, 40%)' }}>
        <section className="flex min-h-0 min-w-0 flex-col px-3 pb-4 sm:px-5">{stage}</section>
        <div ref={handle} role="separator" tabIndex={0} aria-orientation="vertical" aria-label={t('options.resizeStudioPanels')}
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={40} data-studio-split-resize
            onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} onKeyDown={keyboard}
            className="st-focus-inside st-t-fast flex min-h-0 cursor-col-resize touch-none select-none items-center justify-center border-x border-[var(--st-line)] text-[color:var(--st-t3)] hover:bg-[var(--st-fill)] hover:text-[color:var(--st-t1)] focus-visible:bg-[var(--st-fill)] data-[resizing]:text-[color:var(--st-accent)]">
            <GripVertical size={12} aria-hidden />
        </div>
        <aside ref={options} className="flex min-h-0 min-w-0 flex-col [&>div.st-scroll]:min-h-0 [&>div.st-scroll]:flex-1 [&>div.st-scroll]:overflow-y-auto">{children}</aside>
    </div>;
}
