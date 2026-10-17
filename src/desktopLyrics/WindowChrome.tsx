import { useEffect, useState } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';
import { listen, send, type Session } from './bridge';
import type { MusicAppBinding } from '../types/desktopMusicApps';
import WindowFollowMenu from './WindowFollowMenu';

// src/desktopLyrics/WindowChrome.tsx
const edges = [['n', 12], ['s', 15], ['w', 10], ['e', 11], ['nw', 13], ['ne', 14], ['sw', 16], ['se', 17]] as const;
export default function WindowChrome({ session, apps, preferred }: { session: Session; apps: MusicAppBinding[]; preferred: string }) {
  const [state, setState] = useState({ maximized: false, fullscreen: false });
  useEffect(() => listen(message => { if (message.type === 'windowState') setState(message.data); }), []);
  const command = (action: string) => send('window', { action });
  return <>
    <div className={`window-chrome ${state.fullscreen ? 'window-fullscreen' : ''}`}>
      <WindowFollowMenu session={session} apps={apps} preferred={preferred}/>
      <div className="window-drag" onMouseDown={event => {
        if (event.button !== 0) return;
        event.preventDefault(); command(event.detail > 1 ? 'maximize' : 'drag');
      }} title="拖动窗口 · 双击最大化"/>
      {!state.fullscreen ? <div className="window-buttons">
        <button aria-label="最小化窗口" onClick={() => command('minimize')}><Minus size={15}/></button>
        <button aria-label={state.maximized ? '还原窗口' : '最大化窗口'} disabled={state.fullscreen} onClick={() => command('maximize')}>{state.maximized ? <Copy size={13}/> : <Square size={13}/>}</button>
        <button className="window-close" aria-label="关闭应用" onClick={() => command('close')}><X size={16}/></button>
      </div> : null}
    </div>
    {!state.fullscreen && !state.maximized ? edges.map(([edge, hit]) => <div key={edge} className={`window-edge edge-${edge}`} aria-hidden="true"
      onMouseDown={event => { if (event.button === 0) { event.preventDefault(); send('window', { action: 'resize', edge: hit }); } }}/>) : null}
  </>;
}
