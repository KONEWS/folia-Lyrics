import type { VisualizerMode } from '../../types';
import { pickRandomVisualizerMode } from '../../utils/randomVisualizerModes';

// Chooses once for a desktop song identity; a temporary empty media session keeps the last identity.
export function resolveDesktopRandomMode(input: {
    previousSong: string | null;
    song: string | null;
    enabled: boolean;
    mode: VisualizerMode;
    pool: readonly VisualizerMode[];
}, random: () => number = Math.random) {
    if (!input.enabled) return { song: input.song, mode: input.mode };
    const changed = input.song !== null && input.previousSong !== null && input.song !== input.previousSong;
    return {
        song: input.song ?? input.previousSong,
        mode: changed || !input.pool.includes(input.mode)
            ? pickRandomVisualizerMode(input.pool, input.mode, random)
            : input.mode,
    };
}
