import { useVideoLayerSettingsStore, VIDEO_LAYER_OPACITY_BOUNDS, type VideoLayerFit } from '../../../stores/useVideoLayerSettingsStore';
import { useVisualTranslation, VisualCard, VisualRange, VisualToggle } from '../../DesktopVisualControls';
import DesktopSelect from '../../DesktopSelect';
import { isDesktop } from '../../bridge';
import { clearDesktopVideoFile, selectDesktopVideoFile, useDesktopVideoFileStore } from './desktopVideoFile';

// The original video's settings, with the desktop host owning its persistent local-file permission.
export default function DesktopVideoSettings({ transparent = false }: { transparent?: boolean }) {
    const t = useVisualTranslation();
    const video = useVideoLayerSettingsStore();
    const file = useDesktopVideoFileStore();
    return <VisualCard title={t('options.videoLayerSettings')}>
        <VisualToggle label={t('options.videoLayerEnabled')} checked={video.videoLayerEnabled} onChange={video.setVideoLayerEnabled}/>
        <p className="desktop-visual-hint">{t('desktopVisual.videoLocalOnly')}</p>
        <p className="desktop-visual-hint">{t('options.videoLayerNotInExport')}</p>
        {transparent && video.videoLayerEnabled ? <p className="desktop-visual-hint">{t('desktopVisual.videoTransparentNotice')}</p> : null}
        {video.videoLayerEnabled || file.status !== 'none' ? <>
            <label className="desktop-visual-field"><span>{t('options.videoLayerLocalFile')}</span><span>{file.name}</span></label>
            <p className="desktop-visual-hint">{t('desktopVisual.videoLocalFileHint')}</p>
            <div className="action-row">
                <button type="button" disabled={file.busy || !isDesktop()} onClick={selectDesktopVideoFile}>{t('options.videoLayerPickFile')}</button>
                {file.status !== 'none' ? <button type="button" disabled={file.busy} onClick={clearDesktopVideoFile}>{t('options.videoLayerClearFile')}</button> : null}
            </div>
        </> : null}
        {file.error ? <p className="desktop-visual-hint" role="alert">{t(file.error)}</p> : null}
        {file.playbackError ? <p className="desktop-visual-hint" role="alert">{t('desktopVisual.videoPlaybackFailed')}</p> : null}
        {video.videoLayerEnabled ? <>
            <VisualRange label={t('options.videoLayerOpacity')} value={video.videoLayerOpacity} min={VIDEO_LAYER_OPACITY_BOUNDS.min} max={VIDEO_LAYER_OPACITY_BOUNDS.max}
                display={`${Math.round(video.videoLayerOpacity * 100)}%`} onChange={video.setVideoLayerOpacity} beginSlider={() => {}} commitSlider={() => {}}/>
            <label className="desktop-visual-field"><span>{t('options.videoLayerFit')}</span><DesktopSelect label={t('options.videoLayerFit')}
                value={video.videoLayerFit} onChange={value => video.setVideoLayerFit(value as VideoLayerFit)} options={[
                    { value: 'cover', label: t('options.videoLayerFitCover') }, { value: 'contain', label: t('options.videoLayerFitContain') },
                ]}/></label>
        </> : null}
    </VisualCard>;
}
