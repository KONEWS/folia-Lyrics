import type { SceneSound } from '../definition';

// Desktop scenes only render visuals; playback remains in the external player.
export const silentSceneSound: SceneSound = {
    setAcoustics: () => {},
    moveObject: () => {},
    setListener: () => {},
    play: () => ({ stop: () => {} }),
    tier: 'off',
};
