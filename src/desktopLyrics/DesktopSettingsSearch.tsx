import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Search, X, ArrowUpRight } from 'lucide-react';
import i18n from '../i18n/config';
import type { DesktopSettingsSearchEntry } from '../types/desktopSettingsSearch';
import { buildDesktopSettingsSearchIndex, searchDesktopSettings } from './desktopSettingsSearchIndex';
import './settings-search.css';

// src/desktopLyrics/DesktopSettingsSearch.tsx — one searchable entry point for every desktop settings surface.
const text = (key: string) => i18n.t(`desktopLyrics.settingsSearch.${key}`, { lng: 'zh-CN' });
export default function DesktopSettingsSearch({ onNavigate }: { onNavigate: (entry: DesktopSettingsSearchEntry) => void }) {
  const id = useId(), input = useRef<HTMLInputElement>(null), list = useRef<HTMLDivElement>(null);
  const index = useMemo(buildDesktopSettingsSearchIndex, []);
  const [query, setQuery] = useState(''), [active, setActive] = useState(0), [open, setOpen] = useState(false);
  const hits = useMemo(() => searchDesktopSettings(index, query), [index, query]);
  const expanded = open && Boolean(query.trim());
  const choose = (entry: DesktopSettingsSearchEntry) => { setOpen(false); setQuery(''); onNavigate(entry); };
  const move = (next: number) => {
    setActive(next);
    const viewport = list.current, option = viewport?.querySelector<HTMLElement>(`[data-search-option="${next}"]`);
    if (viewport && option) {
      const bounds = viewport.getBoundingClientRect(), item = option.getBoundingClientRect();
      if (item.top < bounds.top) viewport.scrollTop += item.top - bounds.top;
      else if (item.bottom > bounds.bottom) viewport.scrollTop += item.bottom - bounds.bottom;
    }
  };
  const keyboard = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape' && expanded) { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
    if (!expanded) return;
    if (event.key === 'Enter' && hits[active]) { event.preventDefault(); event.stopPropagation(); choose(hits[active]); }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && hits.length) {
      event.preventDefault(); event.stopPropagation();
      move(event.key === 'Home' ? 0 : event.key === 'End' ? hits.length - 1 : (active + (event.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length);
    }
  };
  return <div className="desktop-settings-search" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <div className="desktop-settings-search-input"><Search size={15} aria-hidden="true"/>
      <input ref={input} type="search" role="combobox" aria-label={text('label')} placeholder={text('placeholder')}
        aria-autocomplete="list" aria-expanded={expanded} aria-controls={`${id}-results`}
        aria-activedescendant={expanded && hits[active] ? `${id}-${active}` : undefined} value={query}
        onFocus={() => setOpen(true)} onKeyDown={keyboard} onChange={event => { setQuery(event.target.value); setActive(0); setOpen(true); }}/>
      {query ? <button type="button" aria-label={text('clear')} onClick={() => { setQuery(''); setOpen(false); input.current?.focus(); }}><X size={14}/></button> : null}
    </div>
    {expanded ? <div ref={list} id={`${id}-results`} role="listbox" aria-label={text('results')} className="desktop-settings-search-results">
      {hits.length ? hits.map((entry, position) => <button type="button" role="option" key={entry.key} id={`${id}-${position}`}
        aria-selected={position === active} data-search-option={position} data-search-key={entry.key} onMouseEnter={() => setActive(position)} onClick={() => choose(entry)}>
        <span><strong>{entry.label}</strong><small>{entry.breadcrumb ?? text(entry.section)}</small></span>
        <ArrowUpRight size={14} aria-hidden="true"/>
      </button>) : <p role="status">{text('empty')}</p>}
    </div> : null}
  </div>;
}
