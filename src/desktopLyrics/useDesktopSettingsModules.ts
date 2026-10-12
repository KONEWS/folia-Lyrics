import { useCallback, useEffect, useRef, useState } from 'react';

// src/desktopLyrics/useDesktopSettingsModules.ts — warm settings after first paint and open only complete panels.
type SettingsModules = {
  visual: typeof import('./DesktopVisualSettings')['default'] | null;
  segmentation: typeof import('./DesktopSegmentationSettings')['default'] | null;
};
type SettingsKind = keyof SettingsModules;
type SettingsComponent = NonNullable<SettingsModules[SettingsKind]>;
const cached: SettingsModules = { visual: null, segmentation: null };
const pending: Partial<Record<SettingsKind, Promise<SettingsComponent>>> = {};
// Keep each import in its own loader so the production bundle attaches the right CSS dependency.
const loaders = {
  visual: () => import('./DesktopVisualSettings'),
  segmentation: () => import('./DesktopSegmentationSettings'),
};

// Share a single import between idle warming and a click; failed imports remain retryable.
function prepare(kind: SettingsKind): Promise<SettingsComponent> {
  const ready = cached[kind];
  if (ready) return Promise.resolve(ready);
  return pending[kind] ??= loaders[kind]()
    .then(module => {
      const component = module.default;
      Object.assign(cached, { [kind]: component }); return component;
    }).catch(error => { delete pending[kind]; throw error; });
}

export function useDesktopSettingsModules() {
  const [modules, setModules] = useState<SettingsModules>(() => ({ ...cached }));
  const mounted = useRef(false), revision = useRef(0), opening = useRef<SettingsKind | null>(null);
  const remember = useCallback((kind: SettingsKind, component: SettingsComponent) => {
    if (mounted.current) setModules(previous => previous[kind] === component ? previous : { ...previous, [kind]: component });
  }, []);
  useEffect(() => {
    let active = true, idle = 0, timer = 0;
    mounted.current = true;
    const warm = () => {
      for (const kind of ['visual', 'segmentation'] as const)
        void prepare(kind).then(component => { if (active) remember(kind, component); }).catch(() => undefined);
    };
    const frame = window.requestAnimationFrame(() => {
      if (window.requestIdleCallback) idle = window.requestIdleCallback(warm, { timeout: 1000 });
      else timer = window.setTimeout(warm, 120);
    });
    return () => {
      active = false; mounted.current = false; revision.current++; opening.current = null;
      window.cancelAnimationFrame(frame);
      if (idle) window.cancelIdleCallback(idle);
      if (timer) window.clearTimeout(timer);
    };
  }, [remember]);
  const cancel = useCallback((kind?: SettingsKind) => {
    if (kind && opening.current !== kind) return;
    revision.current++; opening.current = null;
  }, []);
  // Keep the current screen until its replacement module is available; superseded clicks never reopen it later.
  const open = useCallback((kind: SettingsKind, show: () => void, onError: (cause: unknown) => void) => {
    const token = ++revision.current;
    opening.current = kind;
    const showReady = (component: SettingsComponent) => {
      if (!mounted.current || token !== revision.current) return;
      remember(kind, component); opening.current = null; show();
    };
    const ready = cached[kind];
    if (ready) showReady(ready);
    else void prepare(kind).then(showReady).catch(cause => {
      if (mounted.current && token === revision.current) { opening.current = null; onError(cause); }
    });
  }, [remember]);
  return { ...modules, open, cancel };
}
