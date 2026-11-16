import { afterEach, describe, expect, it, vi } from 'vitest';
import { publishSceneViewpoints, useSceneViewpoints, type ViewpointAnchor } from '../../../src/components/scenes/engine/sceneViewpoints';

// A preview and the desktop scene own independent anchor publications and cleanup.
vi.mock('react', () => ({ useSyncExternalStore: (_subscribe: unknown, read: () => unknown) => read() }));
const stage = {}, preview = {};
const seat = (id: string): ViewpointAnchor => ({ kind: 'viewpoint', id, eye: [0, 0, 0], ear: [0, 0, 0], lookAt: [0, 0, -1] });
afterEach(() => {
    publishSceneViewpoints('cinema', null, stage);
    publishSceneViewpoints('cinema', null, preview);
});

describe('scene viewpoint ownership', () => {
    it('restores stage seats when the preview closes', () => {
        const stageSeats = [seat('stage')], previewSeats = [seat('preview')];
        publishSceneViewpoints('cinema', stageSeats, stage);
        publishSceneViewpoints('cinema', previewSeats, preview);
        expect(useSceneViewpoints('cinema')).toBe(previewSeats);
        publishSceneViewpoints('cinema', null, preview);
        expect(useSceneViewpoints('cinema')).toBe(stageSeats);
    });

    it('keeps preview seats when the stage stops first', () => {
        const seats = [seat('preview')];
        publishSceneViewpoints('cinema', [seat('stage')], stage);
        publishSceneViewpoints('cinema', seats, preview);
        publishSceneViewpoints('cinema', null, stage);
        expect(useSceneViewpoints('cinema')).toBe(seats);
        publishSceneViewpoints('cinema', null, preview);
        expect(useSceneViewpoints('cinema')).toEqual([]);
    });
});
