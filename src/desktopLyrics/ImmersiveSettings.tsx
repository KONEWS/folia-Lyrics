import { useEffect, useState } from 'react';
import i18n from '../i18n/config';
import { send, type Preferences } from './bridge';

// src/desktopLyrics/ImmersiveSettings.tsx — persist desktop immersion choices in the native preferences.
const text = (key: string) => i18n.t(`desktopLyrics.${key}`, { lng: 'zh-CN' });
export default function ImmersiveSettings({ preferences: p }: { preferences: Preferences }) {
  const [delay, setDelay] = useState(String(p.immersiveDelay));
  useEffect(() => setDelay(String(p.immersiveDelay)), [p.immersiveDelay]);
  const commit = () => {
    const value = Number(delay);
    if (delay.trim() && Number.isInteger(value) && value >= 1 && value <= 3600) send('immersiveDelay', value);
    else setDelay(String(p.immersiveDelay));
  };
  return <section className="immersive-settings"><div className="section-label">{text('appearanceImmersion')}</div>
    <label className="toggle"><span>{text('coverTheme')}</span><input type="checkbox" checked={p.coverTheme} onChange={e => send('coverTheme', e.target.checked)}/></label>
    <p className="hint">{text('coverThemeHint')}</p>
    <label className="toggle"><span>{text('autoImmersive')}</span><input type="checkbox" checked={p.autoImmersive} onChange={e => send('autoImmersive', e.target.checked)}/></label>
    <label className="immersion-delay"><span>{text('immersiveDelay')}</span><input aria-label={text('immersiveDelay')} type="number" min="1" max="3600" step="1" disabled={!p.autoImmersive}
      value={delay} onChange={e => setDelay(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}/><span>{text('seconds')}</span></label>
    <p className="hint">{text('autoImmersiveHint')}</p>
    <label className="toggle"><span>{text('bottomHoverControls')}</span><input type="checkbox" checked={p.bottomHoverControls} onChange={e => send('bottomHoverControls', e.target.checked)}/></label>
    <p className="hint">{text('bottomHoverHint')}</p>
  </section>;
}
