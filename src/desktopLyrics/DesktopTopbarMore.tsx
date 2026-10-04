import { useCallback, useEffect, useId, useImperativeHandle, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { useCustomSelectPosition } from '../components/shared/useCustomSelectPosition';
import { useCustomSelectKeyboard } from '../components/shared/useCustomSelectKeyboard';
import type { CustomSelectMenuNavigation } from '../components/shared/useCustomSelectOptionFocus';
import './topbar-more.css';

// src/desktopLyrics/DesktopTopbarMore.tsx — compact actions on the shared glass menu and keyboard navigation.
export type TopbarMoreAction = {
  id: string; label: string; title: string; icon: ReactNode; onAction: () => void;
  checked?: boolean; state?: string; disabled?: boolean; busy?: boolean;
};
type Props = { label: string; actions: TopbarMoreAction[] };

export default function DesktopTopbarMore({ label, actions }: Props) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null), menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null), navigation = useRef<CustomSelectMenuNavigation | null>(null);
  const id = useId();
  const close = useCallback(() => setOpen(false), []);
  const show = useCallback(() => setOpen(true), []);
  const available = actions.filter(action => !action.disabled).map(action => ({ value: action.id, label: action.label }));
  const position = useCustomSelectPosition({ open, container, menu, minWidth: 224, close });

  // Adapt the shared option navigation to semantic action items, scrolling only this menu viewport.
  useImperativeHandle(navigation, () => ({
    cancelFocus: () => {},
    focusOption(index: number) {
      const item = menu.current?.querySelector<HTMLButtonElement>(`[data-option-index="${index}"]`);
      if (!item || !menu.current) return;
      item.focus({ preventScroll: true });
      const bounds = menu.current.getBoundingClientRect(), target = item.getBoundingClientRect();
      if (target.top < bounds.top + 6) menu.current.scrollTop -= bounds.top + 6 - target.top;
      if (target.bottom > bounds.bottom - 6) menu.current.scrollTop += target.bottom - bounds.bottom + 6;
    },
  }), []);
  const key = useCustomSelectKeyboard({ enabled: true, open, ready: Boolean(position), value: available[0]?.value ?? '',
    options: available, navigation, trigger, show, close });

  useEffect(() => {
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!container.current?.contains(target) && !menu.current?.contains(target)) close();
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [close]);

  const choose = (action: TopbarMoreAction) => {
    close(); trigger.current?.focus({ preventScroll: true }); action.onAction();
  };
  // Consume the trigger's activation keys before the window-level playback shortcuts handle Space.
  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!open && (event.key === ' ' || event.key === 'Enter')) { event.preventDefault(); event.stopPropagation(); show(); return; }
    key(event);
  };
  return <div ref={container} className="topbar-more-control" onKeyDown={handleKey}
    onBlurCapture={event => { if (!container.current?.contains(event.relatedTarget) && !menu.current?.contains(event.relatedTarget)) close(); }}>
    <button ref={trigger} type="button" className="icon-button topbar-more-trigger" aria-label={label} title={label}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => open ? close() : show()}>
      <MoreHorizontal size={18}/>
    </button>
    {open && position && createPortal(<div ref={menu} id={id} role="menu" aria-label={label}
      className="desktop-glass-menu desktop-top-menu desktop-more-menu" data-wheel-scroll-region
      data-menu-placement={position.placement}
      style={{ left: position.left, top: position.top, bottom: position.bottom, width: position.width, maxHeight: position.maxHeight }}>
      {actions.map(action => {
        const index = available.findIndex(option => option.value === action.id);
        return <button key={action.id} type="button" role={action.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
          aria-label={action.label} aria-checked={action.checked} aria-busy={action.busy || undefined} title={action.title}
          disabled={action.disabled} tabIndex={-1} data-option-index={index >= 0 ? index : undefined}
          className="topbar-more-item" onClick={() => choose(action)}>
          <span className="topbar-more-icon" aria-hidden="true">{action.icon}</span>
          <span className="topbar-more-copy"><span>{action.label}</span>{action.state && <small>{action.state}</small>}</span>
        </button>;
      })}
    </div>, container.current?.closest('.desktop-lyrics') ?? document.body)}
  </div>;
}
