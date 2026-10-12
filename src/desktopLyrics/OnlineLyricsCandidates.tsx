import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { send, type OnlineCandidate, type OnlineState, type Preferences } from './bridge';
import { timeLabel } from './clock';
import i18n from '../i18n/config';
import './online-candidates.css';

// src/desktopLyrics/OnlineLyricsCandidates.tsx — keep all online choices while showing five initially.
const VISIBLE_CANDIDATES = 5;
const text = (key: string, values?: Record<string, string | number>) => i18n.t(`desktopLyrics.onlineCandidates.${key}`, { ...values, lng: 'zh-CN' });
type Props = { songKey: string; online: OnlineState; preferences: Preferences; sources: readonly { id: string; name: string }[] };

export default function OnlineLyricsCandidates({ songKey, online, preferences, sources }: Props) {
  const [expanded, setExpanded] = useState(false);
  const extraId = useId();
  const previous = useRef({ songKey, resultKey: online.key, keys: new Set(online.candidates.map(candidate => candidate.key)) });
  const extra = online.candidates.slice(VISIBLE_CANDIDATES);
  const hiddenSelection = !expanded ? extra.find(candidate => candidate.key === online.selectedKey) : undefined;
  const sourceName = (provider: string) => sources.find(source => source.id === provider)?.name ?? provider;

  // New songs or replacement searches collapse; later results and selection replies keep the user's expansion.
  useEffect(() => {
    const last = previous.current;
    if (last.songKey !== songKey || last.resultKey !== online.key || online.candidates.length <= VISIBLE_CANDIDATES
      || last.keys.size > 0 && !online.candidates.some(candidate => last.keys.has(candidate.key))) setExpanded(false);
    previous.current = { songKey, resultKey: online.key, keys: new Set(online.candidates.map(candidate => candidate.key)) };
  }, [songKey, online.key, online.candidates]);

  const candidateButton = (candidate: OnlineCandidate) => <button key={candidate.key}
    type="button" className={`online-result ${candidate.key === online.selectedKey ? 'chosen' : ''}`}
    disabled={online.busy || !preferences.onlineEnabled || !preferences.onlineProviders.includes(candidate.provider) || !candidate.available}
    onClick={() => send('selectOnline', { id: candidate.key, songKey })}
    aria-pressed={candidate.key === online.selectedKey}
    aria-label={text('use', { title: candidate.title, artist: candidate.artist || text('unknownArtist'), id: candidate.id })}>
    <span className="result-heading"><strong>{candidate.title}</strong>{candidate.key === online.selectedKey
      ? <Check size={14} aria-hidden="true"/> : <span>{candidate.duration > 0 ? timeLabel(candidate.duration) : text('unknownDuration')}</span>}</span>
    <span className="result-artist">{candidate.artist || text('unknownArtist')}{candidate.album ? ` · ${candidate.album}` : ''}</span>
    <span className="result-meta">{sourceName(candidate.provider)} · {candidate.quality}{candidate.autoEligible ? ` · ${text('matching')}` : ''}</span>
  </button>;

  return <div className="online-results" data-settings-target="online-results">
    {online.candidates.slice(0, VISIBLE_CANDIDATES).map(candidateButton)}
    {extra.length > 0 ? <>
      <div id={extraId} className="online-candidates-more" hidden={!expanded}>{extra.map(candidateButton)}</div>
      {hiddenSelection ? <p className="online-candidates-selection" role="status"><Check size={13} aria-hidden="true"/>
        <span>{text('hiddenSelection', { title: hiddenSelection.title, artist: hiddenSelection.artist || text('unknownArtist'), source: sourceName(hiddenSelection.provider), quality: hiddenSelection.quality })}</span></p> : null}
      <button type="button" className="online-candidates-toggle" aria-expanded={expanded} aria-controls={extraId}
        onClick={() => setExpanded(value => !value)}>
        {expanded ? <ChevronUp size={14} aria-hidden="true"/> : <ChevronDown size={14} aria-hidden="true"/>}
        {text(expanded ? 'collapse' : 'showMore', { count: extra.length })}
      </button>
    </> : null}
  </div>;
}
