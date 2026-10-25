import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { SlidersHorizontal } from 'lucide-react';
import type { VisualizerMode } from '../../types';
import { getVisualizerRegistryEntry, getVisualizerModeLabel } from '../../components/visualizer/registry';
import { getVisualizerBackgroundRegistryEntry, getVisualizerBackgroundModeLabel } from '../../components/visualizer/backgrounds/registry';
import { resolveVisualizerBackgroundMode } from '../../stores/visualizerSettingsPersistence';
import { settingsTokens, SettingsKitThemeContext } from '../../components/modal/settings/kit/kitTheme';
import type { DesktopVisualSettingsModel } from '../useDesktopVisualSettings';
import { useCustomSelectPosition } from '../select/useCustomSelectPosition';
import { useVisualTranslation } from '../DesktopVisualControls';
import DesktopVisualLanguage from '../DesktopVisualLanguage';
import DesktopRandomControls from './DesktopRandomControls';

// A small desktop layer reuses every style/background's registered quick controls and stored tuning.
export default function DesktopVisualQuickControls({ mode, model, onVisualSettings, onBackgroundSettings }: {
    mode: VisualizerMode; model: DesktopVisualSettingsModel; onVisualSettings: () => void; onBackgroundSettings: () => void;
}) {
    const t = useVisualTranslation();
    const [open, setOpen] = useState(false);
    const container = useRef<HTMLDivElement>(null), menu = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
    const id = useId();
    const close = useCallback(() => setOpen(false), []);
    const position = useCustomSelectPosition({ open, container, menu, minWidth: 300, close });
    const positioned = Boolean(position);
    const entry = getVisualizerRegistryEntry(mode);
    const backgroundMode = resolveVisualizerBackgroundMode(model.backgroundConfig.mode, mode);
    const background = getVisualizerBackgroundRegistryEntry(backgroundMode);
    const settings = model.panelProps(mode);
    const openSettings = (show: () => void) => { close(); trigger.current?.focus(); show(); };
    useEffect(() => {
        if (!open || !positioned) return;
        const layer = menu.current;
        layer?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled)')?.focus({ preventScroll: true });
        const dismiss = (event: PointerEvent) => {
            const target = event.target as Node;
            if (!menu.current?.contains(target) && !container.current?.contains(target)) close();
        };
        document.addEventListener('pointerdown', dismiss, true);
        return () => {
            document.removeEventListener('pointerdown', dismiss, true);
            if (layer?.contains(document.activeElement)) trigger.current?.focus({ preventScroll: true });
        };
    }, [open, positioned, close]);
    return <div ref={container} className="relative flex shrink-0" onKeyDown={event => {
        if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); trigger.current?.focus(); }
        if (event.key === ' ' || event.key === 'Enter') event.stopPropagation();
    }} onBlurCapture={event => {
        if (!container.current?.contains(event.relatedTarget) && !menu.current?.contains(event.relatedTarget)) close();
    }}>
        <button ref={trigger} type="button" className={`icon-button ${open ? 'selected' : ''}`} aria-label={t('desktopVisual.quickControls')}
            title={t('desktopVisual.quickControls')} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
            onClick={() => setOpen(value => !value)}><SlidersHorizontal size={17}/></button>
        {open && position && createPortal(<SettingsKitThemeContext.Provider value={{ isDaylight: false, theme: model.mergedTheme }}>
            <DesktopVisualLanguage><div ref={menu} id={id} role="dialog" aria-label={t('desktopVisual.quickControls')}
                className="desktop-glass-menu desktop-top-menu fixed pointer-events-auto flex flex-col gap-4 overflow-y-auto p-4" data-wheel-scroll-region
                style={{ ...settingsTokens(false, model.mergedTheme), '--text-primary': 'var(--glass-text)', left: position.left,
                    top: position.top, bottom: position.bottom, width: position.width, maxHeight: position.maxHeight } as CSSProperties}>
                <DesktopRandomControls onOpenPool={() => openSettings(onVisualSettings)}/>
                <section aria-label={getVisualizerModeLabel(mode, t)}>
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs"><span>{getVisualizerModeLabel(mode, t)}</span>
                        <button type="button" onClick={() => openSettings(onVisualSettings)}>{t('desktopVisual.moreSettings')}</button></div>
                    <div className="flex flex-wrap items-center gap-2" data-desktop-style-quick-controls={mode}>
                        {entry.renderQuickControls?.({ ...settings, t, isDaylight: false, theme: model.mergedTheme })}
                    </div>
                </section>
                <section aria-label={t('options.previewBackgroundSettings')}>
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs"><span>{getVisualizerBackgroundModeLabel(backgroundMode, t)}</span>
                        <button type="button" onClick={() => openSettings(onBackgroundSettings)}>{t('desktopVisual.moreSettings')}</button></div>
                    <fieldset disabled={!model.backgroundEnabled || model.backgroundSuppressed} className="flex flex-wrap items-center gap-2 disabled:opacity-50"
                        data-desktop-background-quick-controls={backgroundMode}>
                        {background.renderQuickControls?.({ config: model.backgroundConfig, actions: model.backgroundActions, t, isDaylight: false, theme: model.mergedTheme })}
                    </fieldset>
                    {(!model.backgroundEnabled || model.backgroundSuppressed) && <p className="mt-2 text-xs opacity-60">
                        {t(model.backgroundSuppressed ? 'desktopVisual.backgroundSuppressed' : 'desktopVisual.backgroundHint')}</p>}
                </section>
            </div></DesktopVisualLanguage>
        </SettingsKitThemeContext.Provider>, container.current?.closest('.desktop-lyrics') ?? document.body)}
    </div>;
}
