import { useCallback, useMemo, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import type { VisualizerMode } from '../../types';
import Sheet from '../../components/shared/Sheet';
import { Button, PictureGrid, type PictureState } from '../../components/modal/settings/kit';
import { SettingsKitThemeContext } from '../../components/modal/settings/kit/kitTheme';
import VisualizerRenderer from '../../components/visualizer/VisualizerRenderer';
import { getVisualizerModeLabel, VISUALIZER_REGISTRY } from '../../components/visualizer/registry';
import type { PreviewPlaceholderId } from '../../components/visualizer/PreviewPlaceholder';
import { LyricPreviewProvider } from '../../components/visualizer/preview/LyricPreviewContext';
import LyricStylePicture from '../../components/visualizer/preview/LyricStylePicture';
import { usePreviewClock } from '../../components/visualizer/preview/usePreviewClock';
import VisPlaygroundSampleStage from '../../components/visualizer/window/VisPlaygroundSampleStage';
import DesktopSelect from '../DesktopSelect';
import { useVisualTranslation } from '../DesktopVisualControls';
import { useDesktopFonts } from '../useDesktopFonts';
import type { DesktopVisualSettingsModel } from '../useDesktopVisualSettings';
import VisualizerBoundary from '../VisualizerBoundary';

// A separate sample-song preview reuses the upstream clock, scaled stage and demand-driven thumbnail cache.
type Props = {
    model: DesktopVisualSettingsModel;
    mode: VisualizerMode;
    onMode: (mode: VisualizerMode) => void;
    onClose: () => void;
};

export default function DesktopStylePreview({ model, mode, onMode, onClose }: Props) {
    const t = useVisualTranslation();
    const [previewMode, setPreviewMode] = useState(mode);
    const [placeholderId, setPlaceholderId] = useState<PreviewPlaceholderId>('default');
    const [paused, setPaused] = useState(false);
    const [notice, setNotice] = useState('');
    const clock = usePreviewClock({ mode: previewMode, placeholderId, paused });
    const sample = clock.placeholder;
    const kitTheme = useMemo(() => ({ theme: model.mergedTheme, isDaylight: false }), [model.mergedTheme]);
    const ready = useDesktopFonts({ lines: sample.lines, theme: model.mergedTheme, subtitleTheme: model.subtitleTheme,
        title: sample.title, artist: '', hideTranslationSubtitle: model.rendererProps.hideTranslationSubtitle,
        subtitleContentMode: model.rendererProps.subtitleContentMode, showHarmonySubtitle: model.rendererProps.showHarmonySubtitle }, setNotice);
    const picture = useCallback((value: VisualizerMode, state: PictureState) => (
        <LyricStylePicture mode={value} {...state} active={state.active && !paused}/>
    ), [paused]);
    const apply = () => { model.commitSlider(); onMode(previewMode); onClose(); };

    return <SettingsKitThemeContext.Provider value={kitTheme}>
        <Sheet isOpen onClose={onClose} title={t('desktopVisual.previewTitle')} subtitle={t('desktopVisual.previewHint')}
            size="l" body="fill" footer={<Button variant="primary" onClick={apply}>{t('ui.apply')}</Button>}>
            <div className="flex min-h-0 flex-1 flex-col gap-3" data-desktop-style-preview>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <label className="flex min-w-0 flex-1 items-center gap-2 text-xs">
                        <span className="shrink-0">{t('options.previewText')}</span>
                        <DesktopSelect value={placeholderId} label={t('options.previewText')}
                            onChange={value => setPlaceholderId(value as PreviewPlaceholderId)} options={[
                                { value: 'default', label: t('options.previewTextDefault') },
                                { value: 'reserved', label: t('options.previewTextReserved') },
                            ]}/>
                    </label>
                    <Button icon={paused ? Play : Pause} onClick={() => setPaused(value => !value)}>
                        {t(paused ? 'options.resumePreview' : 'options.pausePreview')}
                    </Button>
                </div>
                <div className="relative min-h-[140px] flex-1 overflow-hidden rounded-xl" style={{ background: model.mergedTheme.backgroundColor }}>
                    {ready ? <VisualizerBoundary mode={previewMode} onRecover={() => setPreviewMode('classic')}>
                        <VisPlaygroundSampleStage>
                            <VisualizerRenderer {...model.rendererProps} key={placeholderId} mode={previewMode} animateStyleSwitch
                                currentTime={clock.currentTime} currentLineIndex={clock.currentLineIndex} duration={sample.loopDuration}
                                lines={sample.lines} theme={model.mergedTheme} isDaylight={false} audioPower={clock.audioPower}
                                audioBands={clock.audioBands} songTitle={sample.title} coverUrl={sample.coverUrl}
                                showText isPreviewMode paused={paused} seed={`desktop-preview-${placeholderId}`}/>
                        </VisPlaygroundSampleStage>
                    </VisualizerBoundary> : <div className="absolute inset-0 grid place-items-center text-sm">{t('playlist.loading')}</div>}
                </div>
                {notice ? <p className="desktop-visual-hint" role="status">{notice}</p> : null}
                <LyricPreviewProvider clock={clock} theme={model.mergedTheme} isDaylight={false} look={model.rendererProps} making={ready && !paused}>
                    <div className="min-h-0 shrink-0" style={{ maxHeight: '35%' }}>
                        <PictureGrid value={previewMode} options={VISUALIZER_REGISTRY.map(entry => ({ value: entry.mode, label: getVisualizerModeLabel(entry.mode, t) }))}
                            picture={picture} columns={4} maxHeight={170} onChange={setPreviewMode}
                            label={t('options.previewVisualizerSettings')} arrowKeys="focus"/>
                    </div>
                </LyricPreviewProvider>
            </div>
        </Sheet>
    </SettingsKitThemeContext.Provider>;
}
