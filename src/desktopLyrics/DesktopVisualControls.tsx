import { createContext, useContext, useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SliderRow, ToggleRow } from '../components/visualizer/panelRows';
import { Toggle } from '../components/modal/settings/kit/Toggle';

// src/desktopLyrics/DesktopVisualControls.tsx — accessible controls for the desktop visual settings surface.
export const UnifiedVisualControlsContext = createContext(false);
export const useVisualTranslation = () => {
  const { t } = useTranslation();
  return (key: string) => String(t(key, { lng: 'zh-CN' }));
};

export function VisualCard({ title, children }: { title?: string; children: ReactNode }) {
  const unified = useContext(UnifiedVisualControlsContext);
  if (unified) return <section className="desktop-visual-card desktop-visual-kit-card">{title ? <h3>{title}</h3> : null}
    <div className="st-card flex flex-col gap-4 rounded-xl bg-[var(--st-card)] p-4 shadow-[0_0_0_1px_var(--st-line)]">{children}</div></section>;
  return <section className="desktop-visual-card">{title ? <h3>{title}</h3> : null}{children}</section>;
}

export function VisualToggle({ label, checked, onChange, disabled = false }: {
  label: string; checked: boolean; onChange: (next: boolean) => void; disabled?: boolean;
}) {
  const labelId = useId();
  const unified = useContext(UnifiedVisualControlsContext);
  if (unified) return <div className="desktop-visual-kit-toggle"><ToggleRow label={label} checked={checked} onChange={onChange} disabled={disabled}/></div>;
  return <div className="desktop-visual-toggle"><span id={labelId} className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
    <span className="flex shrink-0"><Toggle checked={checked} onChange={onChange} disabled={disabled} labelledBy={labelId}/></span>
  </div>;
}

export function VisualRange({ label, value, min, max, step = 0.05, display, onChange, beginSlider, commitSlider }: {
  label: string; value: number; min: number; max: number; step?: number; display?: string;
  onChange: (value: number) => void; beginSlider: () => void; commitSlider: () => void;
}) {
  const unified = useContext(UnifiedVisualControlsContext);
  if (unified) return <div className="desktop-visual-kit-range" onBlurCapture={commitSlider} onKeyUp={commitSlider}>
    <SliderRow label={label} value={value} min={min} max={max} step={step} format={next => display ?? next.toFixed(2)}
      onChange={onChange} onDragStart={beginSlider} onDragEnd={commitSlider}/></div>;
  return <label className="desktop-visual-range"><span>{label}<output>{display ?? value.toFixed(2)}</output></span>
    <input type="range" aria-label={label} min={min} max={max} step={step} value={value}
      onChange={event => onChange(Number(event.target.value))} onPointerDown={beginSlider}
      onPointerUp={commitSlider} onPointerCancel={commitSlider} onBlur={commitSlider} onKeyUp={commitSlider}/>
  </label>;
}
