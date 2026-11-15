// Geometry exchanged by local lyric overlays and their host.
export interface PlayerLayoutRect {
    /** Left edge. */
    readonly left: number;
    /** Top edge. */
    readonly top: number;
    /** Width. */
    readonly width: number;
    /** Height. */
    readonly height: number;
}

export interface PlayerObstacle {
    /** Coarse purpose; future hosts may add roles. */
    readonly role: 'navigation' | 'window' | 'playback' | 'now-playing' | 'panel' | 'notification' | (string & {});
    /** Hidden controls still reserve the pointer region that reveals them. */
    readonly kind: 'control' | 'reveal-area';
    /** Occupied rectangle. */
    readonly rect: PlayerLayoutRect;
}

export interface PlayerLayout {
    /** Live-player bounds in viewport CSS pixels. */
    readonly bounds: PlayerLayoutRect;
    /** Four safe edge distances in CSS pixels, relative to bounds. */
    readonly insets: Readonly<{ top: number; right: number; bottom: number; left: number }>;
    /** Regions to avoid; not guaranteed complete. Count, order and roles are not compatibility promises; native ids stay private. */
    readonly obstacles: readonly PlayerObstacle[];
}
