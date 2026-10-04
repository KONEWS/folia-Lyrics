import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import i18n from '../i18n/config';
import { buildSegmentationExportText, countAppliedSegmentationLines, parseSegmentationImport, SegmentationImportError } from '../utils/lyrics/lyricSegmentationRecord';
import type { useDesktopSegmentation } from './useDesktopSegmentation';
import { useDesktopSettingsDismiss } from './useDesktopSettingsDismiss';

// src/desktopLyrics/DesktopSegmentationSettings.tsx — a local editor for the original Folia word-grouping format.
type Props = { model: ReturnType<typeof useDesktopSegmentation>; returnFocus?: HTMLElement | null; onClose: () => void };
const text = (key: string) => i18n.t(`desktopVisual.${key}`, { lng: 'zh-CN' });
const original = (key: string, count?: number) => i18n.t(`lyricSegmentation.${key}`, { lng: 'zh-CN', count });
export default function DesktopSegmentationSettings({ model, returnFocus, onClose }: Props) {
  const [draft, setDraft] = useState(() => buildSegmentationExportText(model.lyrics));
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const panel = useRef<HTMLElement>(null), close = useRef<HTMLButtonElement>(null), mounted = useRef(false);
  useDesktopSettingsDismiss(panel, onClose);
  useEffect(() => {
    const previous = returnFocus ?? document.activeElement;
    mounted.current = true; close.current?.focus({ preventScroll: true });
    return () => { mounted.current = false; if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => { setDraft(buildSegmentationExportText(model.lyrics)); }, [model.lyrics]);
  // The shared parser rejects text or row changes before the original per-song record is persisted.
  const apply = async () => {
    setBusy(true); setNotice('');
    try {
      const { lines } = parseSegmentationImport(draft, model.lyrics);
      const saved = await model.save(lines);
      if (mounted.current && saved) setNotice(original('saved'));
    } catch (cause) {
      if (mounted.current) setNotice(cause instanceof SegmentationImportError ? original(`importError.${cause.message}`) : String(cause));
    } finally { if (mounted.current) setBusy(false); }
  };
  const reset = async () => {
    setBusy(true); setNotice('');
    try { const cleared = await model.reset(); if (mounted.current && cleared) setNotice(original('restored')); }
    catch (cause) { if (mounted.current) setNotice(String(cause)); }
    finally { if (mounted.current) setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(buildSegmentationExportText(model.lyrics)); if (mounted.current) setNotice(original('currentCopied')); }
    catch { if (mounted.current) setNotice(original('copyFailed')); }
  };
  return <aside ref={panel} className="control-panel desktop-segmentation-settings" role="dialog" aria-modal="true" aria-label={text('segmentation')}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),textarea:not(:disabled)') ?? []);
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
    }}>
    <div className="panel-heading"><strong>{text('segmentation')}</strong><button ref={close} aria-label={text('closeSegmentation')} onClick={onClose}><X size={18}/></button></div>
    <p className="hint">{text('segmentationHint')}</p>
    <p className="hint">{model.record ? `${original('sourceManual')} · ${original('appliedCount', countAppliedSegmentationLines(model.lyrics, model.record))}` : original('statusDefault')}</p>
    <label className="desktop-segmentation-editor">{text('segmentationInput')}<textarea value={draft} disabled={busy || model.loading} onChange={event => setDraft(event.target.value)}/></label>
    <div className="desktop-segmentation-actions"><button disabled={busy || model.loading || !model.songKey} onClick={() => { void apply(); }}>{text('applySegmentation')}</button>
      <button disabled={busy || model.loading || !model.record} onClick={() => { void reset(); }}>{original('reset')}</button>
      <button disabled={busy || model.loading} onClick={() => { void copy(); }}>{original('copyCurrent')}</button></div>
    {model.loading || notice || model.error ? <p className="hint" role="status">{model.loading ? text('loadingSettings') : notice || model.error}</p> : null}
  </aside>;
}
