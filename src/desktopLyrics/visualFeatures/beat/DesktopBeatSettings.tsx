import { useContext, useRef } from 'react';
import SmartBeatSettingsCard from '../../../components/visualizer/SmartBeatSettingsCard';
import BeatEffectsGroup from '../../../components/visualizer/BeatEffectsGroup';
import { getVisualizerRegistryEntry } from '../../../components/visualizer/registry';
import type { VisualizerMode } from '../../../types';
import { useVisualTranslation, VisualCard } from '../../DesktopVisualControls';
import { DesktopBeatContext } from './desktopBeatContext';

// The desktop source picker surrounds the original global switch and per-style beat effect controls.
export function DesktopBeatSettings() {
    const model = useContext(DesktopBeatContext);
    const t = useVisualTranslation();
    const picker = useRef<HTMLInputElement>(null);
    if (!model) return null;
    return <VisualCard title={t('options.smartBeat')}>
        <SmartBeatSettingsCard t={t} descriptionKeyPrefix="desktopVisual.beatMode_"/>
        <p className="desktop-visual-hint">{t('desktopVisual.beatSourceHint')}</p>
        {model.binding ? <p className="desktop-visual-hint">{t('desktopVisual.beatReady')} · {model.binding.name}</p> :
            <p className="desktop-visual-hint">{t(model.loading ? 'playlist.loading' : 'desktopVisual.beatMissing')}</p>}
        <input ref={picker} type="file" accept="audio/*,.flac,.wav,.mp3,.m4a,.ogg,.opus" className="hidden" tabIndex={-1} aria-label={t('desktopVisual.selectBeatAudio')}
            onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void model.analyse(file); }}/>
        <div className="action-row">
            <button type="button" disabled={!model.canAnalyse || Boolean(model.phase)} onClick={() => picker.current?.click()}>{t('desktopVisual.selectBeatAudio')}</button>
            {model.phase ? <button type="button" onClick={model.cancel}>{t('ui.cancel')}</button> : null}
            {model.binding ? <button type="button" disabled={Boolean(model.phase)} onClick={() => void model.clear()}>{t('desktopVisual.clearBeatAudio')}</button> : null}
        </div>
        {model.phase ? <p className="desktop-visual-hint" role="status">{t(`desktopVisual.beatPhase_${model.phase}`)}</p> : null}
        {model.error ? <p className="desktop-visual-hint" role="alert">{t(model.error)}</p> : null}
    </VisualCard>;
}

export function DesktopBeatEffects({ mode, onOpenSmartBeat }: { mode: VisualizerMode; onOpenSmartBeat: () => void }) {
    const t = useVisualTranslation();
    return <BeatEffectsGroup t={t} effects={getVisualizerRegistryEntry(mode).beatEffects} onOpenSmartBeat={onOpenSmartBeat}/>;
}
