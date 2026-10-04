import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

// src/desktopLyrics/DesktopVisualControls.tsx — accessible controls for the desktop visual settings surface.
export const useVisualTranslation = () => {
  const { t } = useTranslation();
  return (key: string) => String(t(key, { lng: 'zh-CN' }));
};

export function VisualCard({ title, children }: { title: string; children: ReactNode }) {
  return <section className="desktop-visual-card"><h3>{title}</h3>{children}</section>;
}

export function VisualToggle({ label, checked, onChange, disabled = false }: {
  label: string; checked: boolean; onChange: (next: boolean) => void; disabled?: boolean;
}) {
  const t = useVisualTranslation();
  return <div className="desktop-visual-toggle"><span>{label}</span><button type="button" role="switch"
    aria-label={label} aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
    title={`${label} · ${t(checked ? 'desktopVisual.enabled' : 'desktopVisual.disabled')}`}>
    {t(checked ? 'desktopVisual.enabled' : 'desktopVisual.disabled')}
  </button></div>;
}

export function VisualRange({ label, value, min, max, step = 0.05, display, onChange, beginSlider, commitSlider }: {
  label: string; value: number; min: number; max: number; step?: number; display?: string;
  onChange: (value: number) => void; beginSlider: () => void; commitSlider: () => void;
}) {
  return <label className="desktop-visual-range"><span>{label}<output>{display ?? value.toFixed(2)}</output></span>
    <input type="range" aria-label={label} min={min} max={max} step={step} value={value}
      onChange={event => onChange(Number(event.target.value))} onPointerDown={beginSlider}
      onPointerUp={commitSlider} onPointerCancel={commitSlider} onBlur={commitSlider} onKeyUp={commitSlider}/>
  </label>;
}
