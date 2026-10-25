import { useEffect, useState } from 'react';
import { useVideoLayerSettingsStore, VIDEO_LAYER_OPACITY_BOUNDS, type VideoLayerFit } from '../../../stores/useVideoLayerSettingsStore';
import { useVisualTranslation, VisualCard, VisualRange, VisualToggle } from '../../DesktopVisualControls';
import DesktopSelect from '../../DesktopSelect';
import { isDesktop } from '../../bridge';
import { clearDesktopVideoFile, selectDesktopVideoFile, useDesktopVideoFileStore } from './desktopVideoFile';
import { desktopVideoUrl } from './desktopVideoSources';

// The original video's settings, with the desktop host owning its persistent local-file permission.
export default function DesktopVideoSettings({ transparent = false }: { transparent?: boolean }) {
    const t = useVisualTranslation();
    const video = useVideoLayerSettingsStore();
    const file = useDesktopVideoFileStore();
    const [url, setUrl] = useState(video.videoLayerUrl);
    const [urlError, setUrlError] = useState(false);
    useEffect(() => setUrl(video.videoLayerUrl), [video.videoLayerUrl]);
    const commitUrl = () => {
        const value = url.trim();
        if (value && !desktopVideoUrl(value)) { setUrlError(true); return; }
        video.setVideoLayerUrl(value); setUrlError(false);
    };
    return <VisualCard title={t('options.videoLayerSettings')}>
        <VisualToggle label={t('options.videoLayerEnabled')} checked={video.videoLayerEnabled} onChange={video.setVideoLayerEnabled}/>
        <p className="desktop-visual-hint">{t('options.videoLayerDesc')}</p>
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
            <label className="desktop-visual-field"><span>{t('options.videoLayerUrl')}</span><input type="url" aria-label={t('options.videoLayerUrl')}
                value={url} onChange={event => setUrl(event.target.value)} onBlur={commitUrl}
                onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commitUrl(); } }} placeholder="https://example.com/loop.mp4"/></label>
            <p className="desktop-visual-hint">{t('desktopVisual.videoUrlHint')}</p>
            {urlError ? <p className="desktop-visual-hint" role="alert">{t('desktopVisual.videoUrlInvalid')}</p> : null}
            <VisualRange label={t('options.videoLayerOpacity')} value={video.videoLayerOpacity} min={VIDEO_LAYER_OPACITY_BOUNDS.min} max={VIDEO_LAYER_OPACITY_BOUNDS.max}
                display={`${Math.round(video.videoLayerOpacity * 100)}%`} onChange={video.setVideoLayerOpacity} beginSlider={() => {}} commitSlider={() => {}}/>
            <label className="desktop-visual-field"><span>{t('options.videoLayerFit')}</span><DesktopSelect label={t('options.videoLayerFit')}
                value={video.videoLayerFit} onChange={value => video.setVideoLayerFit(value as VideoLayerFit)} options={[
                    { value: 'cover', label: t('options.videoLayerFitCover') }, { value: 'contain', label: t('options.videoLayerFitContain') },
                ]}/></label>
        </> : null}
    </VisualCard>;
}
