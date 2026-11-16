import React from 'react';
import { useTranslation } from 'react-i18next';
import { Row, Segmented, Toggle } from '../../modal/settings/kit';
import type { SceneLabel, SceneManifest, SceneQualityPreset } from '../definition';
import { useSceneViewpoints } from '../engine/sceneViewpoints';
import SeatMap from './SeatMap';
import { useSceneSettingsStore } from './useSceneSettingsStore';

// Built-in scene controls apply immediately and share the desktop settings components.
const QUALITIES: readonly SceneQualityPreset[] = ['low', 'medium', 'high'];
export const sceneLabel = (label: SceneLabel, language: string): string =>
    label[language] ?? label[language.split('-')[0]] ?? label.en ?? Object.values(label)[0] ?? '';

const SceneSettingsPanel: React.FC<{ manifest: SceneManifest }> = ({ manifest }) => {
    const { t, i18n } = useTranslation();
    const options = useSceneSettingsStore(state => state.sceneOptions[manifest.id]);
    const setSceneOptions = useSceneSettingsStore(state => state.setSceneOptions);
    const seats = useSceneViewpoints(manifest.id);
    return (
        <div className="flex flex-col gap-3" data-scene-settings={manifest.id}>
            <Row label={t('ui.sceneQuality')}>
                <Segmented
                    value={options?.quality ?? manifest.quality.default}
                    options={QUALITIES.map(value => ({ value, label: t(`ui.sceneQuality_${value}`) }))}
                    onChange={quality => setSceneOptions(manifest.id, { quality })}
                />
            </Row>
            {(manifest.settings ?? []).map(field => (
                <Row key={field.key} label={sceneLabel(field.label, i18n.language)}>
                    <Toggle
                        checked={Boolean(options?.values?.[field.key] ?? field.defaultValue)}
                        onChange={value => setSceneOptions(manifest.id, { values: { ...options?.values, [field.key]: value } })}
                    />
                </Row>
            ))}
            {manifest.viewpoints === 'anchors' && (
                <section data-scene-seat aria-label={t('ui.sceneSeat')} tabIndex={-1} className="flex flex-col gap-3 px-3 pb-3">
                    <h4 className="text-xs font-medium text-[color:var(--st-t2)]">{t('ui.sceneSeat')}</h4>
                    {seats.length > 0
                        ? <SeatMap seats={seats} chosen={options?.viewpoint ?? null} onPick={viewpoint => setSceneOptions(manifest.id, { viewpoint })} />
                        : <p role="status" className="text-xs text-[color:var(--st-t3)]">{t('ui.sceneSeatsLoading')}</p>}
                </section>
            )}
        </div>
    );
};

export default SceneSettingsPanel;
