import { AudioLines, FileUp, FolderPlus, LoaderCircle, RefreshCw, Settings2 } from 'lucide-react';
import i18n from '../i18n/config';
import { send, type OnlineState, type Preferences, type Session } from './bridge';
import { MODES } from './desktopModes';
import { waitingState } from './waitingState';
import './waiting-screen.css';

// src/desktopLyrics/DesktopWaitingScreen.tsx — one relevant next step with optional alternative actions.
type Props = { session: Session; online: OnlineState; preferences: Preferences; connectionError: string;
  lyricStatus: 'idle' | 'parsing' | 'ready' | 'invalid'; title: string; scanning: boolean;
  onSettings: (section?: 'player' | 'online') => void };
const text = (key: string, values?: Record<string, unknown>) => i18n.t(`desktopLyrics.waiting.${key}`, { lng: 'zh-CN', ...values });
const headingKeys = { 'no-player': 'noPlayerTitle', 'connected-empty': 'connectedTitle', matching: 'matchingTitle', failed: 'failedTitle' };

export default function DesktopWaitingScreen(p: Props) {
  const state = waitingState(p), parsing = state.action === 'parsing';
  const current = p.online.key === p.session.key;
  const hasChoices = current && p.online.candidates.some(candidate => candidate.available);
  const primary = state.action === 'player' ? 'choosePlayer' : state.action === 'retry' ? 'retry'
    : state.action === 'import' ? 'importLyrics' : parsing ? 'parsing' : state.kind === 'matching' ? 'showProgress' : hasChoices ? 'chooseLyrics' : 'searchLyrics';
  const description = parsing ? 'parsingDescription' : p.lyricStatus === 'invalid' ? 'invalidDescription'
    : state.kind === 'no-player' ? p.session.sources.length ? 'detectedDescription' : 'noPlayerDescription'
      : state.kind === 'matching' ? 'matchingDescription' : !p.preferences.onlineEnabled ? 'offlineDescription'
        : !p.preferences.onlineProviders.length ? 'noSourcesDescription' : state.kind === 'failed' ? 'failedDescription'
          : hasChoices ? 'choicesDescription' : 'connectedDescription';
  const act = () => {
    if (state.action === 'player') p.onSettings('player');
    else if (state.action === 'retry') send('resetOnline');
    else if (state.action === 'import') send('import');
    else if (!parsing) p.onSettings('online');
  };
  return <section className="waiting-screen" data-wait-state={state.kind} aria-label={text('region')}>
    <div className="waiting-symbol" aria-hidden="true">{state.kind === 'matching' ? <LoaderCircle className="online-spinner" size={36}/> : <AudioLines size={40} strokeWidth={1}/>}</div>
    <div className="eyebrow">FOLIA DESKTOP LYRICS</div><h1>{text(headingKeys[state.kind])}</h1>
    <p className="waiting-description">{text(description)}</p>
    {p.title ? <p className="waiting-track" title={p.title}>{text('recognizedTrack', { title: p.title })}</p> : null}
    {p.connectionError || current && p.online.message && state.kind !== 'no-player' ? <p className="waiting-status" role="status" title={p.connectionError || p.online.message}>{p.connectionError || p.online.message}</p> : null}
    <div className="waiting-actions"><button className="primary-button waiting-primary-action" disabled={parsing} onClick={act}>
      {state.action === 'retry' ? <RefreshCw size={16}/> : state.action === 'import' ? <FileUp size={16}/> : parsing ? <LoaderCircle className="online-spinner" size={16}/> : <Settings2 size={16}/>} {text(primary)}
    </button></div>
    <details className="waiting-alternatives"><summary>{text('alternatives')}</summary><div className="waiting-actions">
      <button onClick={() => p.onSettings()}><Settings2 size={15}/>{text('settings')}</button>
      <button disabled={p.scanning} onClick={() => send('addFolder')}><FolderPlus size={15}/>{text('chooseFolder')}</button>
      <button onClick={() => send('import')}><FileUp size={15}/>{text('importLyrics')}</button>
    </div></details>
    <div className="waiting-notes"><span>{text('styles', { count: MODES.length })}</span><i/><span>{text('automatic')}</span><i/><span>{text('cache')}</span></div>
  </section>;
}
