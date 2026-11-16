import { useSyncExternalStore } from 'react';
import type { SceneAnchor } from '../definition';

// src/components/scenes/engine/sceneViewpoints.ts
// The viewpoints the running scene published (its viewpoint anchors), for the seat map. The host sets them once
// the scene is loaded and clears them when it stops, so the seat map never imports a scene's code.

export type ViewpointAnchor = Extract<SceneAnchor, { kind: 'viewpoint' }>;

const NO_VIEWPOINTS: readonly ViewpointAnchor[] = [];
type PublishedViewpoints = { sceneId: string; viewpoints: readonly ViewpointAnchor[] };
let published: PublishedViewpoints | null = null;
const publishers = new Map<object | string, PublishedViewpoints>();
const listeners = new Set<() => void>();

/** Publishes one host's viewpoints; `null` releases only that host's publication. */
export const publishSceneViewpoints = (sceneId: string, viewpoints: readonly ViewpointAnchor[] | null, owner: object | string = sceneId) => {
    if (viewpoints) publishers.set(owner, { sceneId, viewpoints });
    else if (!publishers.delete(owner)) return;
    // Closing the preview restores the stage's anchors instead of clearing its seat map.
    published = Array.from(publishers.values()).at(-1) ?? null;
    listeners.forEach(listener => listener());
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};
const read = () => published;

/** The viewpoints of that scene while it runs; empty otherwise. */
export const useSceneViewpoints = (sceneId: string | undefined): readonly ViewpointAnchor[] => {
    const current = useSyncExternalStore(subscribe, read, read);
    return current && current.sceneId === sceneId ? current.viewpoints : NO_VIEWPOINTS;
};
