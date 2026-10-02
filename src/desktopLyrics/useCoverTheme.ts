import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { DEFAULT_THEME } from '../services/baseThemes';
import { extractRepresentativeColors } from '../utils/colorExtractor';
import { buildCoverTheme, canRefreshCoverTheme, refreshCoverTheme } from './coverTheme';
import type { Theme } from '../types';

// src/desktopLyrics/useCoverTheme.ts — discard late cover extraction after a song or setting change.
type CoverPalette = { colors: string[]; theme: Theme };
export type CoverThemeRefreshUnavailableReason = 'disabled' | 'missing-cover' | 'loading' | 'neutral' | 'unreadable' | null;
export function useCoverTheme(cover: string, enabled: boolean) {
  const [result, setResult] = useState<{ cover: string; palette: CoverPalette } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const cache = useRef(new Map<string, CoverPalette>()), revision = useRef(0), mounted = useRef(false);
  const input = useRef({ cover, enabled }); input.current = { cover, enabled };
  // Covers may be large data URLs; keep only four completed palettes in this program session.
  const remember = (key: string, palette: CoverPalette) => {
    cache.current.delete(key); cache.current.set(key, palette);
    while (cache.current.size > 4) cache.current.delete(cache.current.keys().next().value!);
  };
  const isCurrent = (token: number) => mounted.current && token === revision.current
    && input.current.cover === cover && input.current.enabled === enabled;
  useEffect(() => {
    mounted.current = true;
    const token = ++revision.current;
    setRefreshing(false);
    if (enabled && cover) {
      const cached = cache.current.get(cover);
      if (cached) { remember(cover, cached); setResult({ cover, palette: cached }); }
      else {
        const accept = (colors: string[]) => {
          if (!isCurrent(token)) return;
          const palette = { colors, theme: buildCoverTheme(colors) };
          remember(cover, palette); setResult({ cover, palette });
        };
        void extractRepresentativeColors(cover).then(accept).catch(() => accept([]));
      }
    }
    return () => { mounted.current = false; revision.current++; };
  }, [cover, enabled]);
  const refresh = useCallback(async () => {
    const palette = cache.current.get(cover);
    if (!mounted.current || !enabled || !cover || input.current.cover !== cover || !input.current.enabled
      || !palette || !canRefreshCoverTheme(palette.colors)) return false;
    const token = ++revision.current;
    setRefreshing(true);
    await Promise.resolve();
    if (!isCurrent(token)) return false;
    const next = { colors: palette.colors, theme: refreshCoverTheme(palette.colors, palette.theme) };
    if (!isCurrent(token)) return false;
    remember(cover, next); setResult({ cover, palette: next }); setRefreshing(false);
    return true;
  }, [cover, enabled]);
  const palette = result?.cover === cover ? result.palette : null;
  const theme = enabled && cover && palette ? palette.theme : DEFAULT_THEME;
  const refreshUnavailableReason: CoverThemeRefreshUnavailableReason = !enabled ? 'disabled'
    : !cover ? 'missing-cover' : !palette ? 'loading' : !canRefreshCoverTheme(palette.colors) ? (palette.theme === DEFAULT_THEME ? 'unreadable' : 'neutral') : null;
  const style = useMemo(() => ({
    '--cover-background': theme.backgroundColor, '--cover-foreground': theme.primaryColor,
    '--cover-accent': theme.accentColor, '--cover-secondary': theme.secondaryColor,
  }) as CSSProperties, [theme]);
  return { theme, style, active: theme !== DEFAULT_THEME, refresh, refreshing: enabled && !!cover && result?.cover === cover && refreshing,
    canRefresh: refreshUnavailableReason === null, refreshUnavailableReason };
}
