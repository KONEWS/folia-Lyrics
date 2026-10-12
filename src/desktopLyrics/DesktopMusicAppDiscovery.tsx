import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Ban, Plus, X } from 'lucide-react';
import i18n from '../i18n/config';
import { listen, send } from './bridge';
import { EMPTY_MUSIC_APP_DISCOVERY } from '../types/desktopMusicApps';
import { MusicAppIcon } from './DesktopMusicApps';
import './music-app-discovery.css';

// src/desktopLyrics/DesktopMusicAppDiscovery.tsx — candidates wait for foreground confirmation before becoming shortcuts.
const text = (key: string, values?: Record<string, string | number>) => i18n.t(`desktopLyrics.musicApps.${key}`, { lng: 'zh-CN', ...values });
export default function DesktopMusicAppDiscovery({ enabled, onOpenChange }: { enabled: boolean; onOpenChange: (open: boolean) => void }) {
  const [discovery, setDiscovery] = useState(EMPTY_MUSIC_APP_DISCOVERY);
  const [foreground, setForeground] = useState(() => !document.hidden && document.hasFocus());
  const [dismissed, setDismissed] = useState(''), [unchecked, setUnchecked] = useState<Set<string>>(() => new Set());
  const dialog = useRef<HTMLDialogElement>(null);
  const batch = useRef('');
  const open = enabled && foreground && discovery.candidates.length > 0 && discovery.batchId !== dismissed;
  const ids = discovery.candidates.filter(app => !unchecked.has(app.id)).map(app => app.id);
  useEffect(() => listen(message => {
    if (message.type !== 'musicAppDiscovery') return;
    if (batch.current !== message.data.batchId) { batch.current = message.data.batchId; setUnchecked(new Set()); }
    setDiscovery(message.data);
  }), []);
  useEffect(() => {
    const refresh = () => setForeground(!document.hidden && document.hasFocus());
    document.addEventListener('visibilitychange', refresh); window.addEventListener('focus', refresh); window.addEventListener('blur', refresh);
    return () => { document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh); window.removeEventListener('blur', refresh); };
  }, []);
  useLayoutEffect(() => {
    const surface = dialog.current;
    if (open && surface && !surface.open) surface.showModal();
    else if (!open && surface?.open) surface.close();
    onOpenChange(open);
  }, [open, onOpenChange]);
  const later = () => { setDismissed(discovery.batchId); send('dismissMusicAppDiscovery', { batchId: discovery.batchId }); };
  const confirm = () => {
    if (!ids.length) return;
    send('confirmMusicApps', { batchId: discovery.batchId, ids });
  };
  return <dialog ref={dialog} className="music-app-discovery-dialog" aria-labelledby="music-app-discovery-title"
    onCancel={event => { event.preventDefault(); later(); }} onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); later(); }
    }}>
    <header><h2 id="music-app-discovery-title">{text('discoveredTitle')}</h2>
      <button type="button" aria-label={text('later')} onClick={later}><X size={17}/></button></header>
    <p>{text('discoveredHint')}</p>
    <div className="music-app-discovery-list">{discovery.candidates.map(app => <div className="music-app-discovery-row" key={app.id}>
      <label><input type="checkbox" checked={!unchecked.has(app.id)} onChange={event => setUnchecked(previous => {
        const next = new Set(previous); if (event.target.checked) next.delete(app.id); else next.add(app.id); return next;
      })}/><MusicAppIcon app={app}/><span><strong>{app.name}</strong>
        <small title={app.launchKind === 'store' ? app.appUserModelId : app.path}>{app.launchKind === 'store' ? text('storeApp') : app.path}</small></span></label>
      <button type="button" className="music-app-block" aria-label={text('blockNamed', { name: app.name })}
        title={text('block')} onClick={() => send('blockMusicApp', { batchId: discovery.batchId, id: app.id })}><Ban size={15}/><span>{text('block')}</span></button>
    </div>)}</div>
    <p className="music-app-discovery-footnote">{text('discoveredFootnote')}</p>
    <footer><button type="button" onClick={later}>{text('later')}</button>
      <button type="button" className="primary-button" disabled={!ids.length} onClick={confirm}><Plus size={15}/>{text('addSelected', { count: ids.length })}</button></footer>
  </dialog>;
}
