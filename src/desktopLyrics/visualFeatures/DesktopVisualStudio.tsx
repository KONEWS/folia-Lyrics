import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import VisPlayground from '../../components/visualizer/window/VisPlayground';
import { Group, Row, Toggle } from '../../components/modal/settings/kit';
import type { DesktopVisualSettingsProps } from '../DesktopVisualSettings';
import DesktopSettingsSearch from '../DesktopSettingsSearch';
import { useDesktopSettingsSearchNavigation } from '../useDesktopSettingsSearchNavigation';
import { useVisualTranslation } from '../DesktopVisualControls';
import { DesktopBeatSettings } from './beat/DesktopBeatSettings';
import DesktopSceneSettings from './DesktopSceneSettings';
import DesktopPerformanceCheck from './performance/DesktopPerformanceCheck';
import { loadDesktopSystemFonts } from './desktopSystemFonts';
import DesktopVisualFeedback from '../DesktopVisualFeedback';
import DesktopVideoSettings from './video/DesktopVideoSettings';
import { drawDesktopStylePicture, drawDesktopBackgroundPicture } from './DesktopStylePicture';
import { DESKTOP_BACKGROUND_MODES, desktopBackgroundMode } from '../desktopBackgrounds';
import DesktopScenePreview from './DesktopScenePreview';
import DesktopStudioGlobalSettings from './DesktopStudioGlobalSettings';
import DesktopRandomControls from './DesktopRandomControls';
import { getVisualizerModeLabel } from '../../components/visualizer/registry';
import { getVisualizerBackgroundModeLabel } from '../../components/visualizer/backgrounds/registry';
import i18n from '../../i18n/config';

// The desktop host supplies data and actions; the upstream studio owns the layout, preview and controls.
export default function DesktopVisualStudio({ model, mode, onMode, onClose, initialSection = 'visualizer', searchNavigation, navigationSequence,
    onSearchNavigate, onClearSearchNavigation, livePreviewSource, returnFocus, onSegmentation, canSegment }: DesktopVisualSettingsProps) {
    const t = useVisualTranslation();
    const root = useRef<HTMLDivElement>(null);
    const [checkingPerformance, setCheckingPerformance] = useState(false);
    const opener = useRef(returnFocus);
    useEffect(() => () => { if (opener.current?.isConnected) opener.current.focus(); }, []);
    const typography = model.typography;
    const editingName = searchNavigation?.entry.mode ? getVisualizerModeLabel(searchNavigation.entry.mode, t)
        : searchNavigation?.entry.background ? getVisualizerBackgroundModeLabel(searchNavigation.entry.background, t) : '';
    const patch = model.patchTypography;
    const hint = useDesktopSettingsSearchNavigation(root, searchNavigation, undefined,
        `[data-visual-section="${searchNavigation?.entry.section ?? initialSection}"]`);
    const close = () => { model.commitSlider(); onClose(); };
    const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
        // React bubbles body-portal keys through this parent before the child dialog's document handler.
        if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;
        if (event.key === 'Escape' && !event.defaultPrevented) {
            event.preventDefault(); event.stopPropagation();
            close();
        }
    };
    return <div ref={root} data-desktop-visual-studio onKeyDown={keyboard}>
        <VisPlayground theme={model.mergedTheme} isDaylight={false} visualizerMode={searchNavigation?.entry.mode ?? (model.staticMode ? 'still' : mode)}
            initialEditSection={initialSection} editSequence={navigationSequence} livePreviewSource={livePreviewSource} loadFonts={loadDesktopSystemFonts}
            compactStyleShelf suspended={checkingPerformance} stylePicture={drawDesktopStylePicture} backgroundPicture={drawDesktopBackgroundPicture} uiScale={0.94}
            availableBackgroundModes={DESKTOP_BACKGROUND_MODES}
            previewRenderer={DesktopScenePreview}
            headerActions={<DesktopSettingsSearch compact onNavigate={entry => { model.commitSlider(); onSearchNavigate(entry); }}/>}
            headerContent={<>
                {editingName ? <div className="desktop-search-editing px-5 py-2"><span>{i18n.t('desktopLyrics.settingsSearch.editing', { lng: 'zh-CN', name: editingName })}</span>
                    <button type="button" onClick={onClearSearchNavigation}>{t('desktopLyrics.settingsSearch.current')}</button></div> : null}
                {hint ? <p className="desktop-settings-search-hint" role="status">{hint}</p> : null}<DesktopVisualFeedback/></>}
            onEditSectionChange={() => { model.commitSlider(); onClearSearchNavigation(); }}
            inspectStyle={Boolean(searchNavigation?.entry.mode)}
            styleSettings={<DesktopRandomControls/>}
            onRandomModeSelected={() => model.setStaticMode(false)}
            backgroundSettings={<div className="flex flex-col gap-6"><Group def={{ id: 'desktop-background', titleKey: 'desktopVisual.backgroundTitle' }}>
                <Row label={t('desktopVisual.originalBackground')} hint={t(model.backgroundSuppressed ? 'desktopVisual.backgroundSuppressed' : 'desktopVisual.backgroundHint')}><Toggle checked={model.backgroundEnabled} onChange={model.setBackgroundEnabled}/></Row>
            </Group><DesktopVideoSettings transparent={model.transparent}/></div>}
            globalSettings={<div className="flex flex-col gap-6"><DesktopStudioGlobalSettings model={model} mode={mode} onMode={onMode} onSegmentation={onSegmentation} canSegment={canSegment}/>
                <DesktopBeatSettings/><DesktopSceneSettings/><DesktopPerformanceCheck onOpenChange={setCheckingPerformance}/></div>}
            backgroundConfig={searchNavigation?.entry.background ? { ...model.backgroundConfig, mode: desktopBackgroundMode(searchNavigation.entry.background) } : model.backgroundConfig}
            backgroundActions={{ ...model.backgroundActions, onModeChange: next => {
                model.commitSlider(); onClearSearchNavigation(); model.backgroundActions.onModeChange?.(next);
            } }}
            visualizerOpacity={model.visualizer.visualizerOpacity} staticMode={model.staticMode}
            fontStyle={typography.lyricsFontStyle} fontScale={typography.lyricsFontScale} fontWeight={typography.lyricsFontWeight}
            customFontFamily={typography.lyricsCustomFont?.family ?? null} customFontLabel={typography.lyricsCustomFont?.label ?? null}
            fontFallbackFamilies={typography.lyricsFontFallbackFamilies} subtitleFontInheritsLyrics={typography.subtitleFontInheritsLyrics}
            subtitleFontStyle={typography.subtitleFontStyle} subtitleFontScale={typography.subtitleFontScale} subtitleFontWeight={typography.subtitleFontWeight}
            subtitleFontFamily={typography.subtitleFontFamily} subtitleFontFallbackFamilies={typography.subtitleFontFallbackFamilies}
            subtitleContentMode={typography.subtitleContentMode} subtitleOverlayLayout={typography.subtitleOverlayLayout}
            showSubtitleTranslation={model.translated} hideTranslationSubtitle={model.rendererProps.hideTranslationSubtitle}
            subtitleOverlayOpacity={typography.subtitleOverlayOpacity} subtitleOverlayBackground={typography.subtitleOverlayBackground}
            subtitleUpcomingLyricsBlur={typography.subtitleUpcomingLyricsBlur} showHarmonySubtitle={typography.showHarmonySubtitle}
            harmonySubtitleBackground={typography.harmonySubtitleBackground}
            onFontStyleChange={lyricsFontStyle => patch({ lyricsFontStyle })} onFontScaleChange={lyricsFontScale => patch({ lyricsFontScale })}
            onFontWeightChange={lyricsFontWeight => patch({ lyricsFontWeight })} onCustomFontChange={lyricsCustomFont => patch({ lyricsCustomFont })}
            onUploadCustomFont={typography.handleUploadLyricsCustomFont} onFontFallbackFamiliesChange={lyricsFontFallbackFamilies => patch({ lyricsFontFallbackFamilies })}
            onSubtitleFontInheritsLyricsChange={subtitleFontInheritsLyrics => patch({ subtitleFontInheritsLyrics })}
            onSubtitleFontStyleChange={subtitleFontStyle => patch({ subtitleFontStyle })} onSubtitleFontScaleChange={subtitleFontScale => patch({ subtitleFontScale })}
            onSubtitleFontWeightChange={subtitleFontWeight => patch({ subtitleFontWeight })} onSubtitleFontFamilyChange={subtitleFontFamily => patch({ subtitleFontFamily })}
            onSubtitleFontFallbackFamiliesChange={subtitleFontFallbackFamilies => patch({ subtitleFontFallbackFamilies })}
            onVisualizerModeChange={next => { model.commitSlider(); onClearSearchNavigation(); model.setStaticMode(next === 'still'); onMode(next); }}
            onVisualizerOpacityChange={visualizerOpacity => model.patchVisualizer({ visualizerOpacity })}
            onToggleHideTranslationSubtitle={hidePlayerTranslationSubtitle => patch({ hidePlayerTranslationSubtitle })}
            onToggleShowSubtitleTranslation={model.setTranslated} onSubtitleContentModeChange={subtitleContentMode => patch({ subtitleContentMode })}
            onSubtitleOverlayLayoutChange={subtitleOverlayLayout => patch({ subtitleOverlayLayout })}
            onSubtitleOverlayOpacityChange={subtitleOverlayOpacity => patch({ subtitleOverlayOpacity })}
            onToggleSubtitleOverlayBackground={subtitleOverlayBackground => patch({ subtitleOverlayBackground })}
            onToggleSubtitleUpcomingLyricsBlur={subtitleUpcomingLyricsBlur => patch({ subtitleUpcomingLyricsBlur })}
            onToggleShowHarmonySubtitle={showHarmonySubtitle => patch({ showHarmonySubtitle })}
            onToggleHarmonySubtitleBackground={harmonySubtitleBackground => patch({ harmonySubtitleBackground })}
            onClose={close}/>
    </div>;
}
