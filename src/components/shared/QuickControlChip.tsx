import React, { useId } from 'react';
import { Tooltip } from '../modal/settings/kit/Tooltip';
import { Toggle } from '../modal/settings/kit/Toggle';

// src/components/shared/QuickControlChip.tsx
// 播放面板里紧凑参数控件的两种形态：短文字胶囊和带图标的滑块开关。
// 放在 shared/ 下，让面板和各 visualizer 背景模式都能用，不产生反向依赖。
// 胶囊用控制页的淡底，布尔选项复用设置页的 Toggle，滑块位置和颜色一起表示状态；
// 颜色全取面板的 --st-* 变量，亮暗跟着面板走，不用调用方再传。

const BASE = 'st-t-fast st-focus-inside inline-flex h-7 shrink-0 items-center justify-center rounded-lg transition-[background-color,color,box-shadow,scale,opacity] enabled:active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40';

/** The value after `current` in `values`, from the first again after the last: what a chip that cycles shows next. */
export const cycleValue = <T,>(values: readonly T[], current: T): T => (
    values[(values.indexOf(current) + 1) % values.length]
);

interface QuickControlChipProps {
    onClick: () => void;
    label: string;
    title: string;
    /** Nothing to change to now (an uploaded picture is the other choice, and there is none): the chip only says what is set. */
    disabled?: boolean;
    /** For a chip that opens a layer (the kit's Popover): the button it opens from. */
    buttonRef?: React.Ref<HTMLButtonElement>;
    /** For a chip that opens a layer: whether it is open. The chip then says it has one, and looks pressed while it is open. */
    expanded?: boolean;
}

export const QuickControlChip: React.FC<QuickControlChipProps> = ({
    onClick,
    label,
    title,
    disabled,
    buttonRef,
    expanded,
}) => (
    <Tooltip text={title} className="flex">
        <button
            ref={buttonRef}
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`${BASE} whitespace-nowrap px-2.5 text-xs enabled:hover:text-[color:var(--st-t1)] ${expanded ? 'bg-[var(--st-fill2)] text-[color:var(--st-t1)]' : 'bg-[var(--st-fill)] text-[color:var(--st-t2)] enabled:hover:bg-[var(--st-fill2)]'}`}
            aria-label={title}
            aria-haspopup={expanded === undefined ? undefined : 'true'}
            aria-expanded={expanded}
        >
            {label}
        </button>
    </Tooltip>
);

interface QuickControlToggleProps {
    active: boolean;
    onToggle: () => void;
    label: string;
    children: React.ReactNode;
}

export const QuickControlToggle: React.FC<QuickControlToggleProps> = ({
    active,
    onToggle,
    label,
    children,
}) => {
    const labelId = useId();
    return (
        <Tooltip text={label} className="inline-flex min-h-8 items-center gap-2 rounded-lg bg-[var(--st-fill)] px-2 py-1">
            <span aria-hidden="true" className="shrink-0 text-[color:var(--st-t2)]">{children}</span>
            <span id={labelId} className="sr-only">{label}</span>
            <Toggle checked={active} onChange={onToggle} labelledBy={labelId} />
        </Tooltip>
    );
};
