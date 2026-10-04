import { useEffect, useMemo, useRef, useState } from 'react';
import type { LyricData } from '../types';
import type { LyricSegmentationRecord } from '../types/lyricSegmentation';
import { loadSegmentationBySongKey } from '../services/lyricSegmentation';
import { removeFromCache, saveToCache } from '../services/db';
import { applyLyricWordSegmentation, createLyricSegmentationRecord } from '../utils/lyrics/lyricSegmentationRecord';

// src/desktopLyrics/useDesktopSegmentation.ts — original per-song word grouping without changing the lyric timing pipeline.
export function useDesktopSegmentation(key: string, source: LyricData) {
  const songKey = key ? `desktop:${key}` : '';
  const [loaded, setLoaded] = useState<{ key: string; record: LyricSegmentationRecord | null }>({ key: '', record: null });
  const [error, setError] = useState('');
  const active = useRef({ key: songKey, mounted: false }); active.current.key = songKey;
  useEffect(() => {
    active.current.mounted = true;
    return () => { active.current.mounted = false; };
  }, []);
  useEffect(() => {
    let cancelled = false; setError('');
    if (!songKey) { setLoaded({ key: '', record: null }); return; }
    void loadSegmentationBySongKey(songKey).then(record => {
      if (!cancelled) setLoaded({ key: songKey, record: record?.songKey === songKey ? record : null });
    }).catch(cause => {
      if (!cancelled) { setLoaded({ key: songKey, record: null }); setError(String(cause)); }
    });
    return () => { cancelled = true; };
  }, [songKey]);
  const record = loaded.key === songKey ? loaded.record : null;
  const lyrics = useMemo(() => applyLyricWordSegmentation(source, record) ?? source, [source, record]);
  // A completed write belongs to its captured song; it cannot update another song's visible record.
  const save = async (lines: Record<string, string[]>) => {
    if (!songKey) return false;
    const next = createLyricSegmentationRecord(songKey, 'manual', lines);
    await saveToCache(`lyricSeg_${songKey}`, next);
    if (!active.current.mounted || active.current.key !== songKey) return false;
    setLoaded({ key: songKey, record: next }); return true;
  };
  const reset = async () => {
    if (!songKey) return false;
    await removeFromCache(`lyricSeg_${songKey}`);
    if (!active.current.mounted || active.current.key !== songKey) return false;
    setLoaded({ key: songKey, record: null }); return true;
  };
  return { songKey, lyrics, record, error, loading: Boolean(songKey && loaded.key !== songKey), save, reset };
}
