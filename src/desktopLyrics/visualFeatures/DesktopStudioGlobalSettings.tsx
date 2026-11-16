import { Button, Group, Row, Toggle } from '../../components/modal/settings/kit';
import { LYRIC_ANTIALIAS_LABEL_KEYS, lyricRenderScaleChoices } from '../../components/visualizer/renderQuality/LyricRenderQualityRows';
import type { LyricAntialias, LyricRenderScale, Theme, VisualizerFrameRate } from '../../types';
import { VISUALIZER_FRAME_RATE_OPTIONS } from '../../utils/frameRateLimiter';
import DesktopSelect from '../DesktopSelect';
import DesktopSettingsTransparency from '../DesktopSettingsTransparency';
import DesktopVisualConfigActions from '../DesktopVisualConfigActions';
import { UnifiedVisualControlsContext, useVisualTranslation } from '../DesktopVisualControls';
import type { DesktopVisualSettingsProps } from '../DesktopVisualSettings';

// Desktop-only controls share the studio's global tab without repeating its font, subtitle or style cards.
type Props = Pick<DesktopVisualSettingsProps, 'model' | 'mode' | 'onMode' | 'onSegmentation' | 'canSegment'>;
const INTENSITIES: readonly Theme['animationIntensity'][] = ['calm', 'normal', 'chaotic'];

export default function DesktopStudioGlobalSettings({ model, mode, onMode, onSegmentation, canSegment = false }: Props) {
    const t = useVisualTranslation();
    const quality = model.visualizer.lyricRenderQuality;
    return <>
        <Group def={{ id: 'desktop-studio-global', titleKey: 'options.previewGlobalSettings' }}>
            <UnifiedVisualControlsContext.Provider value>
                <DesktopSettingsTransparency/>
            </UnifiedVisualControlsContext.Provider>
            <Row label={t('desktopVisual.frameRate')} note={t('desktopVisual.frameRateHint')}>
                <DesktopSelect value={String(model.visualizer.visualizerFrameRate)} label={t('desktopVisual.frameRate')}
                    options={[
                        ...VISUALIZER_FRAME_RATE_OPTIONS.map(value => ({ value: String(value), label: `${value} FPS` })),
                        { value: 'off', label: t('desktopVisual.frameRateDisplay') },
                    ]}
                    onChange={value => model.visualizer.handleSetVisualizerFrameRate(value === 'off' ? 'off' : Number(value) as VisualizerFrameRate)}/>
            </Row>
            <Row label={t('options.lyricRenderScale')}>
                <DesktopSelect value={String(quality.scale)} label={t('options.lyricRenderScale')}
                    options={lyricRenderScaleChoices()}
                    onChange={value => model.patchVisualizer({ lyricRenderQuality: { ...quality, scale: Number(value) as LyricRenderScale } })}/>
            </Row>
            <Row label={t('options.lyricAntialias')}>
                <DesktopSelect value={quality.antialias} label={t('options.lyricAntialias')}
                    options={(['auto', 'on', 'off'] as const).map(value => ({ value, label: t(LYRIC_ANTIALIAS_LABEL_KEYS[value]) }))}
                    onChange={value => model.patchVisualizer({ lyricRenderQuality: { ...quality, antialias: value as LyricAntialias } })}/>
            </Row>
            <Row label={t('ui.animationIntensity')}>
                <DesktopSelect value={model.animationIntensity} label={t('ui.animationIntensity')}
                    options={INTENSITIES.map(value => ({ value, label: t(`animation.${value}`) }))}
                    onChange={value => model.setAnimationIntensity(value as Theme['animationIntensity'])}/>
            </Row>
            <Row label={t('desktopVisual.staticMode')}>
                <Toggle checked={model.staticMode} onChange={model.setStaticMode}/>
            </Row>
            <Row label={t('desktopVisual.segmentation')} hint={!canSegment ? t('desktopVisual.segmentationUnavailable') : undefined}>
                <Button disabled={!canSegment || !onSegmentation} onClick={() => onSegmentation?.()}>{t('desktopVisual.segmentation')}</Button>
            </Row>
        </Group>
        <div className="px-4"><DesktopVisualConfigActions model={model} mode={mode} onMode={onMode}/></div>
    </>;
}
