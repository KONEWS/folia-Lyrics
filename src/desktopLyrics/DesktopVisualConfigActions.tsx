import { useRef, useState } from 'react';
import { Copy, Download, Upload } from 'lucide-react';
import type { VisualizerMode } from '../types';
import { createSafeObjectUrl } from '../utils/blobGuards';
import { useVisualTranslation } from './DesktopVisualControls';
import type { DesktopVisualSettingsModel } from './useDesktopVisualSettings';

// src/desktopLyrics/DesktopVisualConfigActions.tsx — portable visual configuration actions for this host.
export default function DesktopVisualConfigActions({ model, mode, onMode }: {
  model: DesktopVisualSettingsModel; mode: VisualizerMode; onMode: (mode: VisualizerMode) => void;
}) {
  const t = useVisualTranslation();
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const copy = async (format: 'json' | 'code') => {
    const next = model.exportConfig(format, mode);
    setText(next);
    try { await navigator.clipboard.writeText(next); setFeedback(t('desktopVisual.copied')); }
    catch { setFeedback(t('desktopVisual.copyManually')); requestAnimationFrame(() => textarea.current?.select()); }
  };
  const download = () => {
    const next = model.exportConfig('json', mode);
    setText(next);
    const url = createSafeObjectUrl(new Blob([next], { type: 'application/json;charset=utf-8' }));
    if (!url) { setFeedback(t('desktopVisual.exportFailed')); return; }
    const link = document.createElement('a');
    link.href = url; link.download = 'folia-Lyrics-visual-settings.json'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setFeedback(t('desktopVisual.exported'));
  };
  // Import applies validated renderer settings first, then updates the root-owned mode once.
  const apply = async (input: string) => {
    if (busy || !input.trim()) return;
    setBusy(true); setFeedback('');
    try {
      const result = await model.importConfig(input);
      if (result.ok && result.mode) onMode(result.mode);
      setFeedback(result.ok ? t('desktopVisual.imported') : result.error || t('desktopVisual.importFailed'));
    } catch { setFeedback(t('desktopVisual.importFailed')); }
    finally { setBusy(false); }
  };
  const readFile = async (file: File | undefined) => {
    if (!file || busy) return;
    try { const next = await file.text(); setText(next); setFeedback(t('desktopVisual.fileReady')); }
    catch { setFeedback(t('desktopVisual.importFailed')); }
  };
  return <details className="desktop-visual-config" data-visual-config>
    <summary>{t('desktopVisual.configTitle')}</summary>
    <p className="desktop-visual-hint">{t('desktopVisual.configHint')}</p>
    <div className="desktop-visual-actions">
      <button type="button" onClick={() => void copy('code')} disabled={busy}><Copy size={14}/>{t('desktopVisual.copyCode')}</button>
      <button type="button" onClick={() => void copy('json')} disabled={busy}><Copy size={14}/>{t('options.copyJson')}</button>
      <button type="button" onClick={download} disabled={busy}><Download size={14}/>{t('desktopVisual.exportJson')}</button>
      <button type="button" onClick={() => fileInput.current?.click()} disabled={busy}><Upload size={14}/>{t('desktopVisual.chooseConfig')}</button>
    </div>
    <label className="desktop-visual-field"><span>{t('desktopVisual.configInput')}</span><textarea ref={textarea}
      aria-label={t('desktopVisual.configInput')} value={text} onChange={event => setText(event.target.value)} rows={3} disabled={busy}/></label>
    <button type="button" disabled={busy || !text.trim()} onClick={() => void apply(text)}>{t(busy ? 'desktopVisual.importing' : 'desktopVisual.applyConfig')}</button>
    <input ref={fileInput} type="file" className="hidden" accept=".json,.txt,application/json,text/plain" aria-label={t('desktopVisual.chooseConfig')}
      onChange={event => { void readFile(event.target.files?.[0]); event.target.value = ''; }}/>
    {feedback ? <p role="status" className="desktop-visual-feedback">{feedback}</p> : null}
  </details>;
}
