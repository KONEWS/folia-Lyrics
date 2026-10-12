import { useState } from 'react';
import { Ban, FolderOpen, Music2, Play, Plus, RefreshCw, X } from 'lucide-react';
import i18n from '../i18n/config';
import { isDesktop, send, type MusicAppBinding } from './bridge';
import type { MusicAppCandidate, MusicAppIdentity } from '../types/desktopMusicApps';
import './music-apps.css';

// src/desktopLyrics/DesktopMusicApps.tsx — extensible native player shortcuts shared by the waiting page and settings.
const text = (key: string, values?: Record<string, string | number>) => i18n.t(`desktopLyrics.musicApps.${key}`, { lng: 'zh-CN', ...values });

export function MusicAppIcon({ app }: { app?: MusicAppIdentity }) {
  const [failedIcon, setFailedIcon] = useState('');
  const icon = app?.icon ?? '';
  return <span className="music-app-icon" aria-hidden="true">
    {icon.startsWith('data:image/png;base64,') && icon !== failedIcon
      ? <img src={icon} alt="" onError={() => setFailedIcon(icon)}/>
      : app ? <Music2 size={28}/> : <Plus size={25}/>}
  </span>;
}

export function DesktopMusicAppShortcuts({ apps, showAddButton, onAdd, onSettings }: {
  apps: MusicAppBinding[]; showAddButton: boolean; onAdd: () => void; onSettings: () => void;
}) {
  const emptySlots = showAddButton ? Math.max(1, 3 - apps.length) : 0;
  return <div className="music-app-shortcuts" role="group" aria-label={text('title')}>
    <div className="music-app-buttons">{apps.map(app => {
      const label = text('launchNamed', { name: app.name });
      return <button key={app.slot} type="button" className="music-app-shortcut" data-music-app-slot={app.slot}
        aria-label={label} title={label} onClick={() => send('launchMusicApp', app.slot)}>
        <MusicAppIcon app={app}/>
      </button>;
    })}{Array.from({ length: emptySlots }, (_, index) => <button key={`add-${index}`} type="button"
      className="music-app-shortcut music-app-add" data-music-app-add aria-label={text('add')} title={text('add')} onClick={onAdd}>
      <MusicAppIcon/>
    </button>)}</div>
    <button type="button" className="music-app-manage" onClick={onSettings}>{text('manage')}</button>
  </div>;
}

export function DesktopMusicAppSettings({ apps, blocked, showAddButton, autoDiscover }: { apps: MusicAppBinding[]; blocked: MusicAppCandidate[]; showAddButton: boolean; autoDiscover: boolean }) {
  const available = isDesktop();
  return <div className="music-app-settings" data-settings-target="music-apps" role="group" aria-label={text('title')}>
    <div className="music-app-settings-title">{text('title')}</div>
    <p className="hint">{text(available ? 'hint' : 'previewHint')}</p>
    <label className="toggle"><span>{text('autoDiscover')}</span><input type="checkbox" checked={autoDiscover}
      disabled={!available} onChange={event => send('autoDiscoverMusicApps', event.target.checked)}/></label>
    <p className="hint music-app-discovery-hint">{text('discoveryHint')}</p>
    <button type="button" className="wide-button music-app-scan" disabled={!available} onClick={() => send('scanMusicApps')}>
      <RefreshCw size={15}/>{text('scan')}
    </button>
    <label className="toggle"><span>{text('showAddButton')}</span><input type="checkbox" checked={showAddButton}
      disabled={!available} onChange={event => send('showMusicAppAddButton', event.target.checked)}/></label>
    <div className="music-app-bindings">{apps.map(app => {
      const slot = app.slot;
      return <div className="music-app-binding" key={slot} data-music-app-binding={slot}>
        <div className="music-app-info"><MusicAppIcon app={app}/><div className="music-app-details">
          <strong>{app.name}</strong>
          <span title={app.launchKind === 'store' ? app.appUserModelId : app.path}>{app.launchKind === 'store' ? text('storeApp') : app.path}</span>
        </div></div>
        <div className="music-app-binding-actions">
          <button type="button" disabled={!available} aria-label={text('replaceSlot', { slot: slot + 1 })}
            onClick={() => send('bindMusicApp', slot)}><FolderOpen size={14}/>{text('replace')}</button>
            <button type="button" disabled={!available} aria-label={text('launchNamed', { name: app.name })}
              onClick={() => send('launchMusicApp', slot)}><Play size={14}/>{text('launch')}</button>
            <button type="button" disabled={!available} aria-label={text('removeSlot', { slot: slot + 1 })}
              title={text('remove')} onClick={() => send('removeMusicApp', slot)}><X size={14}/></button>
            <button type="button" disabled={!available || blocked.some(item => app.launchKind === 'store'
              ? item.appUserModelId === app.appUserModelId : item.path.toLowerCase() === app.path.toLowerCase())}
              aria-label={text('blockNamed', { name: app.name })} title={text('blockBoundHint')}
              onClick={() => send('blockMusicApp', { slot })}><Ban size={14}/>{text('block')}</button>
        </div>
      </div>;
    })}</div>
    <button type="button" className="wide-button music-app-add-binding" data-settings-target="music-app-add" disabled={!available} onClick={() => send('addMusicApp')}>
      <Plus size={16}/>{text('bindNew')}
    </button>
    {blocked.length ? <details className="music-app-blocked"><summary>{text('blockedTitle', { count: blocked.length })}</summary>
      <p className="hint">{text('blockedHint')}</p>{blocked.map(app => <div className="music-app-blocked-row" key={app.id}>
        <span title={app.name}>{app.name}</span><button type="button" disabled={!available}
          aria-label={text('unblockNamed', { name: app.name })} onClick={() => send('unblockMusicApp', { id: app.id })}>{text('unblock')}</button>
      </div>)}</details> : null}
  </div>;
}
