import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Search } from 'lucide-react';
import VisPlayground from '../../components/visualizer/window/VisPlayground';
import { Button, Group, Row, Toggle } from '../../components/modal/settings/kit';
import type { DesktopVisualSettingsProps } from '../DesktopVisualSettings';
import DesktopSettingsSearch from '../DesktopSettingsSearch';
import { useDesktopSettingsSearchNavigation } from '../useDesktopSettingsSearchNavigation';
import { useVisualTranslation } from '../DesktopVisualControls';
import { DesktopBeatSettings } from './beat/DesktopBeatSettings';
import { loadDesktopSystemFonts } from './desktopSystemFonts';
import DesktopVisualFeedback from '../DesktopVisualFeedback';
import DesktopVideoSettings from './video/DesktopVideoSettings';

// The desktop host supplies data and actions; the upstream studio owns the layout, preview and controls.
export default function DesktopVisualStudio({ model, mode, onMode, onClose, initialSection = 'visualizer', searchNavigation, navigationSequence,
    onSearchNavigate, onClearSearchNavigation, livePreviewSource, returnFocus, onOpenOptions }: DesktopVisualSettingsProps & { onOpenOptions: () => void }) {
    const t = useVisualTranslation();
    const root = useRef<HTMLDivElement>(null);
    const [searchOpen, setSearchOpen] = useState(false);
    const opener = useRef(returnFocus);
    useEffect(() => () => { if (opener.current?.isConnected) opener.current.focus(); }, []);
    const typography = model.typography;
    const patch = model.patchTypography;
    const hint = useDesktopSettingsSearchNavigation(root, searchNavigation);
    const close = () => { model.commitSlider(); onClose(); };
    const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
            event.preventDefault(); event.stopPropagation();
            if (searchOpen) setSearchOpen(false); else close();
        }
    };
    return <div ref={root} data-desktop-visual-studio onKeyDown={keyboard}>
        <VisPlayground theme={model.mergedTheme} isDaylight={false} visualizerMode={searchNavigation?.entry.mode ?? (model.staticMode ? 'still' : mode)}
            initialEditSection={initialSection} editSequence={navigationSequence} livePreviewSource={livePreviewSource} loadFonts={loadDesktopSystemFonts}
            headerActions={<>
                <Button variant="quiet" onClick={() => setSearchOpen(value => !value)} aria-label={t('desktopLyrics.settingsSearch.label')}><Search size={16}/></Button>
                <Button variant="quiet" onClick={onOpenOptions}>{t('desktopVisual.desktopOptions')}</Button>
            </>}
            headerSlot={searchOpen ? <DesktopSettingsSearch onNavigate={entry => { setSearchOpen(false); model.commitSlider(); onSearchNavigate(entry); }}/> : <>{hint ? <span role="status">{hint}</span> : null}<DesktopVisualFeedback/></>}
            onRandomModeSelected={() => model.setStaticMode(false)}
            backgroundSettings={<><Group def={{ id: 'desktop-background', titleKey: 'desktopVisual.backgroundTitle' }}>
                <Row label={t('desktopVisual.originalBackground')}><Toggle checked={model.backgroundEnabled} onChange={model.setBackgroundEnabled}/></Row>
            </Group><DesktopVideoSettings transparent={model.transparent}/></>}
            globalSettings={<DesktopBeatSettings/>} backgroundConfig={searchNavigation?.entry.background ? { ...model.backgroundConfig, mode: searchNavigation.entry.background } : model.backgroundConfig} backgroundActions={model.backgroundActions}
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
