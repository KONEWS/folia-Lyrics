import type { OnlineState, Preferences, Session } from './bridge';

// src/desktopLyrics/waitingState.ts — next actions derived from current host state, not status-message wording.
export type WaitingKind = 'no-player' | 'connected-empty' | 'matching' | 'failed';
export type WaitingAction = 'player' | 'online' | 'retry' | 'import' | 'parsing';
type Input = { session: Session; online: OnlineState; preferences: Preferences; connectionError: string;
  lyricStatus: 'idle' | 'parsing' | 'ready' | 'invalid' };

// Ignore old-song results and distinguish an empty initial state from a completed unsuccessful lookup.
export function waitingState({ session, online, preferences, connectionError, lyricStatus }: Input): { kind: WaitingKind; action: WaitingAction } {
  const current = online.key === session.key;
  const matching = current && (online.busy || online.phase === 'matching');
  const failed = current && (online.phase === 'failed' || !online.phase && online.errors.length > 0);
  const connected = Boolean(session.key || session.sessionId || session.source) && !connectionError;
  const onlineAvailable = preferences.onlineEnabled && preferences.onlineProviders.length > 0;
  if (lyricStatus === 'parsing') return { kind: 'matching', action: 'parsing' };
  if (connectionError) return { kind: 'no-player', action: 'player' };
  if (matching) return { kind: 'matching', action: 'online' };
  if (lyricStatus === 'invalid') return { kind: 'failed', action: 'import' };
  if (failed) return { kind: 'failed', action: !onlineAvailable ? 'import' : session.title ? 'retry' : 'online' };
  if (!connected) return { kind: 'no-player', action: 'player' };
  return { kind: 'connected-empty', action: onlineAvailable ? 'online' : 'import' };
}
