import { useTranslation } from 'react-i18next';
import { Button, Group, Row } from '../../components/modal/settings/kit';
import { listScenes, useChosenScene } from '../../components/scenes/registry';
import SceneSettingsPanel, { sceneLabel } from '../../components/scenes/settings/SceneSettingsPanel';
import { useSceneSettingsStore } from '../../components/scenes/settings/useSceneSettingsStore';
import DesktopSelect from '../DesktopSelect';

// Built-in scenes borrow the desktop lyrics and background without changing the external player's sound.
export default function DesktopSceneSettings({ onMoreSettings }: { onMoreSettings?: () => void } = {}) {
    const { t, i18n } = useTranslation();
    const sceneId = useSceneSettingsStore(state => state.sceneId);
    const setSceneId = useSceneSettingsStore(state => state.setSceneId);
    const chosen = useChosenScene();
    return <Group def={{ id: 'desktop-scene', titleKey: 'ui.sceneSettings' }}
        action={onMoreSettings ? <Button variant="quiet" onClick={onMoreSettings}>{t('desktopVisual.moreSettings')}</Button> : undefined}>
        <Row label={t('ui.scene')}>
            <DesktopSelect value={sceneId ?? ''} label={t('ui.scene')} options={[
                { value: '', label: t('ui.sceneNone') },
                ...listScenes().map(scene => ({ value: scene.manifest.id, label: sceneLabel(scene.manifest.name, i18n.language) })),
            ]} onChange={value => setSceneId(value || null)}/>
        </Row>
        {chosen ? <SceneSettingsPanel manifest={chosen.manifest}/> : null}
    </Group>;
}
