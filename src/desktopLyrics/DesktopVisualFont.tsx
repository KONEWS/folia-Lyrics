import { useEffect, useRef, useState } from 'react';
import type { Theme } from '../types';
import FontFallbackStackControl from '../components/visualizer/FontFallbackStackControl';
import DesktopSelect from './DesktopSelect';
import { useVisualTranslation, VisualRange, VisualToggle } from './DesktopVisualControls';

// src/desktopLyrics/DesktopVisualFont.tsx — builtin and custom font controls using the original fallback editor.
type Props = {
  theme: Theme; fontStyle: Theme['fontStyle']; family: string | null; fallback: string[]; weight: number | null;
  onStyle: (style: Theme['fontStyle']) => void; onFamily: (family: string | null) => void;
  onFallback: (families: string[]) => void; onWeight: (weight: number | null) => void;
  beginSlider: () => void; commitSlider: () => void;
};

export default function DesktopVisualFont({ theme, fontStyle, family, fallback, weight, onStyle, onFamily,
  onFallback, onWeight, beginSlider, commitSlider }: Props) {
  const t = useVisualTranslation();
  const [draft, setDraft] = useState(family ?? '');
  const familyInput = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(family ?? ''), [family]);
  const commit = () => { const next = draft.trim() || null; if (next !== family) onFamily(next); };
  return <div className="desktop-visual-font">
    <label className="desktop-visual-field"><span>{t('options.fontFamily')}</span><DesktopSelect value={family ? 'custom' : fontStyle}
      label={t('options.fontFamily')} onChange={value => { if (value === 'custom') familyInput.current?.focus(); else onStyle(value as Theme['fontStyle']); }}
      options={[...(['sans', 'serif', 'mono'] as const).map(value => ({ value, label: t(`options.font${value === 'sans' ? 'Sans' : value === 'serif' ? 'Serif' : 'Mono'}`) })),
        { value: 'custom', label: t('desktopVisual.customFontFamily') }]}/></label>
    <label className="desktop-visual-field"><span>{t('desktopVisual.customFontFamily')}</span><input ref={familyInput} type="text"
      aria-label={t('desktopVisual.customFontFamily')} value={draft} onChange={event => setDraft(event.target.value)}
      onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(); } }}
      placeholder={t('desktopVisual.customFontPlaceholder')}/></label>
    <p className="desktop-visual-hint">{t('desktopVisual.customFontHint')}</p>
    <FontFallbackStackControl label={t('options.fontFallbackFamilies')} value={fallback} onChange={onFallback}
      theme={theme} placeholder={t('options.fontFallbackFamiliesPlaceholder')}/>
    <VisualToggle label={t('options.fontWeightAuto')} checked={weight === null} onChange={auto => onWeight(auto ? null : 400)}/>
    {weight !== null ? <VisualRange label={t('options.fontWeight')} value={weight} min={100} max={900} step={10}
      display={String(weight)} onChange={onWeight} beginSlider={beginSlider} commitSlider={commitSlider}/> : null}
  </div>;
}
