import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { MusicAppBinding } from '../types/desktopMusicApps';
import { send, type Session } from './bridge';
import { buildFollowMenuOptions, followMenuSelectedLabel } from './windowFollowMenuModel';

// src/desktopLyrics/WindowFollowMenu.tsx — title-bar source switcher; wave motion follows each native media session.
function WaveMark({ playing, muted = false }: { playing: boolean; muted?: boolean }) {
  return <span className={`follow-wave ${playing ? 'follow-wave-playing' : ''} ${muted ? 'follow-wave-muted' : ''}`} aria-hidden="true">
    {Array.from({ length: 8 }, (_, index) => <i key={index}/>)}
  </span>;
}

type Props = { session: Session; apps: MusicAppBinding[]; preferred: string };
export default function WindowFollowMenu({ session, apps, preferred }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), title = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const { source, sources } = session;
  const options = useMemo(() => open ? buildFollowMenuOptions({ source, sources }, apps, preferred) : [], [open, source, sources, apps, preferred]);
  const selected = useMemo(() => followMenuSelectedLabel({ source, sources }, apps, preferred), [source, sources, apps, preferred]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const choose = (source: string) => {
    // Even reselecting the current source supersedes a music-app launch that is still pending.
    send('source', source);
    setOpen(false); title.current?.focus({ preventScroll: true });
  };
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    // Keep menu navigation separate from window-level playback shortcuts.
    if ([' ', 'Spacebar', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Escape'].includes(event.key)) event.stopPropagation();
    if (event.key === 'Escape' && open) {
      event.preventDefault(); setOpen(false); title.current?.focus({ preventScroll: true }); return;
    }
    if (!open || event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const choices = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('.window-follow-menu button:not(:disabled)') ?? []);
    if (!choices.length) return;
    const index = choices.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'ArrowDown' ? (index + 1) % choices.length
      : index < 0 ? choices.length - 1 : (index + choices.length - 1) % choices.length;
    choices[next]?.focus({ preventScroll: true });
  };

  return <div ref={root} className="window-follow-root" onKeyDown={key}
    onBlurCapture={event => { if (!root.current?.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={title} type="button" className="window-title-button" aria-label="Folia 桌面歌词，切换跟随音乐软件"
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      title={`当前跟随：${selected}`} onClick={() => setOpen(value => !value)}>
      <WaveMark playing={false}/><span>Folia 桌面歌词</span><ChevronDown className="window-title-chevron" size={12}/>
    </button>
    {open ? <div id={menuId} role="menu" aria-label="选择跟随的音乐软件" className="desktop-glass-menu window-follow-menu">
      <button type="button" role="menuitemradio" aria-checked={!preferred}
        className="window-follow-choice" onClick={() => choose('')}>
        <WaveMark playing={false}/>
        <span className="window-follow-copy"><strong>自动跟随</strong><small>优先跟随正在播放的应用</small></span>
        {!preferred ? <Check size={15} aria-hidden="true"/> : null}
      </button>
      {options.length ? <div className="window-follow-divider" role="separator"/> : null}
      {options.map((option, index) => <button key={`${option.id}:${option.label}:${index}`} type="button" role="menuitemradio"
        aria-checked={option.selected} aria-disabled={option.disabled} disabled={option.disabled}
        className={`window-follow-choice ${option.running ? 'window-follow-running' : 'window-follow-offline'}`}
        title={`${option.label} · ${option.status}`} onClick={() => choose(option.id)}>
        <WaveMark playing={option.playing} muted={!option.running}/>
        <span className="window-follow-copy"><strong>{option.label}</strong><small>{option.status}</small></span>
        {option.selected ? <Check size={15} aria-hidden="true"/> : null}
      </button>)}
      {!options.length ? <p className="window-follow-empty">尚未发现音乐软件</p> : null}
    </div> : null}
  </div>;
}
