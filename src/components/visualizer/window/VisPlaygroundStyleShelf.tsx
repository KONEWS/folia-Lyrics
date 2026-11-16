import React, { useId } from 'react';
import { GripHorizontal } from 'lucide-react';
import { useStyleShelfResize } from './useStyleShelfResize';

// The compact style list keeps a draggable boundary above the studio's scrollable settings.
interface VisPlaygroundStyleShelfProps {
    compact: boolean;
    resizeLabel: string;
    resizeHint: string;
    children: React.ReactNode;
}

export default function VisPlaygroundStyleShelf({ compact, resizeLabel, resizeHint, children }: VisPlaygroundStyleShelfProps) {
    const shelfId = useId();
    const { shelfRef, handleRef, ...events } = useStyleShelfResize(compact);
    return <>
        <div
            id={shelfId}
            ref={shelfRef}
            data-style-shelf
            className={compact ? 'flex min-h-0 shrink-0 flex-col overflow-hidden px-4 pb-2' : 'flex shrink-0 flex-col'}
            style={compact ? { height: 'var(--st-style-shelf-height, 42%)' } : undefined}
        >
            {children}
        </div>
        {compact && <div
            ref={handleRef}
            role="separator"
            tabIndex={0}
            aria-label={resizeLabel}
            aria-orientation="horizontal"
            aria-controls={shelfId}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={42}
            data-style-shelf-resize
            className="st-focus-inside st-t-fast flex h-6 shrink-0 cursor-row-resize touch-none select-none items-center justify-center gap-2 border-y border-[var(--st-line)] text-[color:var(--st-t3)] transition-colors hover:bg-[var(--st-fill)] hover:text-[color:var(--st-t1)] focus-visible:bg-[var(--st-fill)] data-[resizing]:bg-[var(--st-fill)] data-[resizing]:text-[color:var(--st-accent)]"
            {...events}
        >
            <GripHorizontal size={16} aria-hidden />
            <span aria-hidden className="text-[11px] leading-4">{resizeHint}</span>
        </div>}
    </>;
}
