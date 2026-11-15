import React from 'react';
import { useKitReducedMotion } from './motion';
import { useRowAria } from './Row';
import { useChoiceMark } from './useChoiceMark';

// src/components/modal/settings/kit/Segmented.tsx
// A choice between two to four short options, all of them in view. The raised mark under the
// chosen one slides to a new choice. It is as wide as its options need, or, asked to fill, as wide
// as the place it is in.

type SegmentedProps<T extends string> = {
    /** The chosen value; none is marked when it is not among the options. */
    value: T;
    /** `icon`: a small picture before the option's label. */
    options: ReadonlyArray<{ value: T; label: string; disabled?: boolean; icon?: React.ReactNode }>;
    /** Called for a new choice, not for a click on the one already chosen. */
    onChange: (value: T) => void;
    /** As wide as the place it is in, each option an equal share of it. */
    fill?: boolean;
    /** The whole choice is dimmed and out of reach; one option alone has its own `disabled`. */
    disabled?: boolean;
};

export const Segmented = <T extends string>({ value, options, onChange, fill, disabled }: SegmentedProps<T>): React.ReactElement => {
    const reduced = useKitReducedMotion();
    const { rootRef, markRef } = useChoiceMark(value, options, reduced);

    return (
        <div
            ref={rootRef}
            role="group"
            {...useRowAria()}
            aria-disabled={disabled || undefined}
            className={`relative ${fill ? 'flex w-full' : 'inline-flex max-w-full flex-wrap'} min-h-8 items-stretch overflow-hidden rounded-lg bg-[var(--st-fill)] p-0 ${disabled ? 'pointer-events-none opacity-40' : ''}`}
        >
            {/* One persistent mark slides inside this choice; it never remounts under another button. */}
            <span ref={markRef} aria-hidden data-segmented-mark className="pointer-events-none absolute left-0 top-0 bg-[var(--st-raise)]"
                style={{ borderRadius: 6, boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)' }}/>
            {options.map(option => {
                const selected = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        disabled={disabled || option.disabled}
                        onClick={() => {
                            if (!selected) onChange(option.value);
                        }}
                        className={`st-focus-inside st-t-fast relative inline-flex h-8 items-center justify-center whitespace-nowrap rounded-md bg-transparent! text-[13px] transition-colors disabled:cursor-not-allowed ${fill ? 'min-w-0 flex-1 px-1.5' : 'px-3'}${option.disabled ? ' opacity-40' : ''} ${selected ? 'text-[color:var(--st-t1)]' : 'text-[color:var(--st-t2)] enabled:hover:text-[color:var(--st-t1)]'}`}
                    >
                        {option.icon
                            ? <span className="relative inline-flex min-w-0 items-center gap-1.5">{option.icon}<span className="truncate">{option.label}</span></span>
                            : <span className={fill ? 'relative block truncate' : 'relative'}>{option.label}</span>}
                    </button>
                );
            })}
        </div>
    );
};

export default Segmented;
