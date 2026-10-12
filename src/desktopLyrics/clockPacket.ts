import type { Clock } from './bridge';

// src/desktopLyrics/clockPacket.ts — bind host clock packets to the currently presented song and session.
type ClockIdentity = { key?: string; sessionId?: string; sequence?: number };

// Older hosts omit identity fields; when supplied, identity and ordering must both match before re-anchoring.
export function acceptClockPacket(previous: Clock & ClockIdentity, packet: Clock & ClockIdentity,
  currentSession: { key: string; sessionId?: string }, now: number): (Clock & ClockIdentity) | null {
  if (packet.key !== undefined && packet.key !== currentSession.key) return null;
  if (packet.sessionId !== undefined && packet.sessionId !== (currentSession.sessionId ?? '')) return null;
  if (packet.sequence !== undefined && (!Number.isSafeInteger(packet.sequence) || packet.sequence < 0)) return null;
  if (packet.sequence !== undefined && previous.sequence !== undefined && packet.sequence <= previous.sequence) return null;
  return { ...packet, received: now };
}
