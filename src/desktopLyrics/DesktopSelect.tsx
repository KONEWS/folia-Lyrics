import { useCallback, useRef } from 'react';
import { CustomSelect } from '../components/shared/CustomSelect';
import type { CustomSelectOption } from '../components/shared/CustomSelectMenu';

// src/desktopLyrics/DesktopSelect.tsx — existing select behavior with the shared desktop glass skin.
type Props = { value: string; onChange: (value: string) => void; options: CustomSelectOption[]; label: string; topbar?: boolean };
export default function DesktopSelect({ value, onChange, options, label, topbar = false }: Props) {
    const root = useRef<HTMLDivElement>(null);
    const portal = useCallback(() => root.current?.closest<HTMLElement>('.desktop-lyrics') ?? null, []);
    const clip = useCallback(() => root.current?.closest<HTMLElement>('.control-panel') ?? null, []);
    // Anchor a compound style picker to its complete capsule, including its icon and padding.
    const anchor = useCallback(() => root.current?.closest<HTMLElement>('.topbar-mode-picker') ?? null, []);
    return <div ref={root} className="desktop-select-host"><CustomSelect value={value} onChange={onChange} options={options} ariaLabel={label}
        keyboardNavigation className="desktop-glass-select" menuClassName={`desktop-glass-menu ${topbar ? 'desktop-top-menu' : ''}`}
        getAnchorElement={topbar ? anchor : undefined} getPortalContainer={portal} getClipElement={clip}/></div>;
}
