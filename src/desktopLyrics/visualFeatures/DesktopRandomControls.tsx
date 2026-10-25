import { RefreshCw, Shuffle } from 'lucide-react';
import { useVisualizerSettingsStore } from '../../stores/useVisualizerSettingsStore';
import { useRandomPool } from '../../components/visualizer/random/useRandomPool';
import RandomPoolGroup from '../../components/visualizer/random/RandomPoolGroup';
import { useVisualTranslation, VisualToggle } from '../DesktopVisualControls';

// Both desktop entry points use the original random pool and actions, including the one-style minimum.
export default function DesktopRandomControls({ showPool = false, onOpenPool }: { showPool?: boolean; onOpenPool?: () => void }) {
    const t = useVisualTranslation();
    const enabled = useVisualizerSettingsStore(state => state.randomVisualizerModePerSong);
    const setEnabled = useVisualizerSettingsStore(state => state.handleToggleRandomVisualizerModePerSong);
    const pool = useRandomPool();
    return <div data-desktop-random-controls>
        <VisualToggle label={t('commandPalette.commands.visualizer-toggle-random-per-song.title')}
            checked={enabled} onChange={value => setEnabled(value, { notify: false })}/>
        {enabled && <>
            <div className="flex flex-wrap items-center gap-2 py-2">
                <button type="button" className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs"
                    disabled={!pool.canReroll} onClick={pool.reroll}><RefreshCw size={14}/>{t('options.randomVisualizerReroll')}</button>
                {onOpenPool && <button type="button" className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs"
                    onClick={onOpenPool}><Shuffle size={14}/>{t('options.randomPoolChoose')}</button>}
            </div>
            {showPool && <RandomPoolGroup/>}
        </>}
    </div>;
}
