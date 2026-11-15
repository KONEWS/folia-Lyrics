import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import type { PlayerLayoutRect, PlayerLayout, PlayerObstacle } from '../types/playerOverlay';
import { playerOverlayLayout } from '../services/playerOverlayLayout';
import { isMainAppSurface } from '../utils/appSurface';
import { EMPTY_PLAYER_INSETS } from '../utils/playerOverlayGeometry';

// src/hooks/usePlayerOverlayLayout.ts
// Each native control owns its geometry registration and its cleanup.

export const usePlayerOverlayRoot = (
    ref: RefObject<HTMLElement | null>, active: boolean,
    insets: PlayerLayout['insets'] = EMPTY_PLAYER_INSETS,
) => {
    const { top, right, bottom, left } = insets;
    useLayoutEffect(() => {
        if (!active || !isMainAppSurface || !ref.current) return;
        return playerOverlayLayout.registerRoot(ref.current, { top, right, bottom, left });
    }, [ref, active, top, right, bottom, left]);
};

export const usePlayerOverlayObstacle = (
    key: string,
    role: PlayerObstacle['role'],
    enabled = true,
) => {
    const elementRef = useRef<HTMLElement | null>(null);
    const disposeRef = useRef<(() => void) | undefined>(undefined);
    const enabledRef = useRef(enabled);
    enabledRef.current = enabled;
    const register = useCallback(() => {
        const element = elementRef.current;
        if (!element || disposeRef.current) return;
        disposeRef.current = playerOverlayLayout.register(element, () => element.isConnected && enabledRef.current
            ? { key, role, kind: 'control', rect: element.getBoundingClientRect() }
            : null);
    }, [key, role]);
    const dispose = useCallback(() => { disposeRef.current?.(); disposeRef.current = undefined; }, []);
    // Callback refs retain AnimatePresence exits until the node actually unmounts.
    const ref = useCallback((element: HTMLElement | null) => {
        dispose();
        elementRef.current = element;
        register();
    }, [register, dispose]);
    useLayoutEffect(() => { register(); return dispose; }, [register, dispose]);
    useLayoutEffect(playerOverlayLayout.invalidate, [enabled]);
    return { ref, invalidate: playerOverlayLayout.invalidate };
};

export const usePlayerOverlayReservation = (
    key: string,
    role: PlayerObstacle['role'],
    read: (bounds: PlayerLayoutRect) => PlayerLayoutRect,
    enabled = true,
    observedRef?: RefObject<HTMLElement | null>,
) => {
    useLayoutEffect(() => {
        if (!enabled) return;
        return playerOverlayLayout.register(observedRef?.current ?? null, (bounds) => ({ key, role, kind: 'reveal-area', rect: read(bounds) }));
    }, [key, role, read, enabled, observedRef]);
};
