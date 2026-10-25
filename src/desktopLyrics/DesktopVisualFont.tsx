import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { Theme } from '../types';
import FontFallbackStackControl from '../components/visualizer/window/FontFallbackStackControl';
import DesktopSelect from './DesktopSelect';
import { useVisualTranslation, VisualRange, VisualToggle } from './DesktopVisualControls';

// src/desktopLyrics/DesktopVisualFont.tsx — builtin and custom font controls using the original fallback editor.
const DesktopSystemFontPicker = lazy(() => import('./visualFeatures/DesktopSystemFontPicker'));
type Props = {
  theme: Theme; fontStyle: Theme['fontStyle']; family: string | null; fallback: string[]; weight: number | null;
  onStyle: (style: Theme['fontStyle']) => void; onFamily: (family: string | null) => void;
  onFallback: (families: string[]) => void; onWeight: (weight: number | null) => void;
  onUpload?: (file: File) => Promise<{ ok: boolean; error?: string }>;
  beginSlider: () => void; commitSlider: () => void;
};

export default function DesktopVisualFont({ theme, fontStyle, family, fallback, weight, onStyle, onFamily,
  onFallback, onWeight, onUpload, beginSlider, commitSlider }: Props) {
  const t = useVisualTranslation();
  const [draft, setDraft] = useState(family ?? '');
  const [picking, setPicking] = useState(false);
  const familyInput = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(family ?? ''), [family]);
  const commit = () => { const next = draft.trim() || null; if (next !== family) onFamily(next); };
  return <div className="desktop-visual-font">
    <label className="desktop-visual-field"><span>{t('options.fontFamily')}</span><DesktopSelect value={family ? 'custom' : fontStyle}
      label={t('options.fontFamily')} onChange={value => { if (value === 'custom') setPicking(true); else onStyle(value as Theme['fontStyle']); }}
      options={[...(['sans', 'serif', 'mono'] as const).map(value => ({ value, label: t(`options.font${value === 'sans' ? 'Sans' : value === 'serif' ? 'Serif' : 'Mono'}`) })),
        { value: 'custom', label: t('desktopVisual.customFontFamily') }]}/></label>
    <label className="desktop-visual-field"><span>{t('desktopVisual.customFontFamily')}</span><input ref={familyInput} type="text"
      aria-label={t('desktopVisual.customFontFamily')} value={draft} onChange={event => setDraft(event.target.value)}
      onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(); } }}
      placeholder={t('desktopVisual.customFontPlaceholder')}/></label>
    <p className="desktop-visual-hint">{t('desktopVisual.customFontHint')}</p>
    <button type="button" onClick={() => setPicking(true)}>{t('options.chooseSystemFont')}</button>
    {picking ? <Suspense fallback={null}><DesktopSystemFontPicker theme={theme} family={family} fallback={fallback} fontStyle={fontStyle}
      onFamily={onFamily} onFallback={onFallback} onUpload={onUpload} onClose={() => setPicking(false)}/></Suspense> : null}
    <FontFallbackStackControl label={t('options.fontFallbackFamilies')} value={fallback} onChange={onFallback}
      placeholder={t('options.fontFallbackFamiliesPlaceholder')}/>
    <VisualToggle label={t('options.fontWeightAuto')} checked={weight === null} onChange={auto => onWeight(auto ? null : 400)}/>
    {weight !== null ? <VisualRange label={t('options.fontWeight')} value={weight} min={100} max={900} step={10}
      display={String(weight)} onChange={onWeight} beginSlider={beginSlider} commitSlider={commitSlider}/> : null}
  </div>;
}
