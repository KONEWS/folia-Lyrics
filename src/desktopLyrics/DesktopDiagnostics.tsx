import { Copy, FolderOpen } from 'lucide-react';
import i18n from '../i18n/config';
import { isDesktop, send } from './bridge';

// src/desktopLyrics/DesktopDiagnostics.tsx — native support actions remain available from the desktop settings search.
export default function DesktopDiagnostics() {
  const text = (key: string) => i18n.t(`desktopLyrics.diagnostics.${key}`, { lng: 'zh-CN' });
  return <section data-settings-section="diagnostics" aria-label={text('title')}>
    <div className="section-label">{text('title')}</div><p className="hint">{text('hint')}</p>
    <div className="action-row">
      <button type="button" data-settings-target="diagnostics" disabled={!isDesktop()} onClick={() => send('copyDiagnostics')}><Copy size={15}/>{text('copy')}</button>
      <button type="button" data-settings-target="open-logs" disabled={!isDesktop()} onClick={() => send('openLogFolder')}><FolderOpen size={15}/>{text('openLogs')}</button>
    </div>
  </section>;
}
