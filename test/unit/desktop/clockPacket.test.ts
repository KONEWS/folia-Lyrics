import { describe, expect, it } from 'vitest';
import { EMPTY } from '../../../src/desktopLyrics/bridge';
import { acceptClockPacket } from '../../../src/desktopLyrics/clockPacket';
import { clockPosition } from '../../../src/desktopLyrics/clock';

// test/unit/desktop/clockPacket.test.ts — host identity/order guards preserve pause anchors and real seeks.
const session = { key: 'song-a', sessionId: 'session-a' };
const packet = { ...EMPTY, ...session, sequence: 10, position: 42.8, duration: 180, hasTimeline: true, playing: false };
const manual = { enabled: false, playing: false, position: 0, received: 0 };

describe('desktop clock packet acceptance', () => {
  it('keeps the native fractional pause anchor for every subsequent frame', () => {
    const clock = acceptClockPacket(EMPTY, packet, session, 1000)!;
    expect(clockPosition(clock, 1000, manual)).toBe(42.8);
    expect(clockPosition(clock, 60000, manual)).toBe(42.8);
  });
  it('rejects a late playing update after a newer pause update', () => {
    expect(acceptClockPacket(packet, { ...packet, sequence: 9, playing: true, position: 42 }, session, 1200)).toBeNull();
    expect(acceptClockPacket(packet, packet, session, 1200)).toBeNull();
  });
  it('rejects packets from an old song or session even when their sequence is newer', () => {
    expect(acceptClockPacket(packet, { ...packet, sequence: 11, key: 'old-song' }, session, 1200)).toBeNull();
    expect(acceptClockPacket(packet, { ...packet, sequence: 11, sessionId: 'old-session' }, session, 1200)).toBeNull();
  });
  it('uses the host-wide sequence across song changes', () => {
    const nextSession = { ...session, key: 'song-b' };
    expect(acceptClockPacket(packet, { ...packet, ...nextSession, sequence: 9 }, nextSession, 1200)).toBeNull();
    expect(acceptClockPacket(packet, { ...packet, ...nextSession, sequence: 11, position: 0 }, nextSession, 1200)?.position).toBe(0);
  });
  it('accepts authoritative backward and forward seeks while paused', () => {
    expect(acceptClockPacket(packet, { ...packet, sequence: 11, position: 4 }, session, 1200)?.position).toBe(4);
    expect(acceptClockPacket(packet, { ...packet, sequence: 11, position: 90 }, session, 1200)?.position).toBe(90);
  });
  it('resumes from the frozen position and applies the current rate', () => {
    const clock = acceptClockPacket(packet, { ...packet, sequence: 11, playing: true, rate: 2 }, session, 30000)!;
    expect(clockPosition(clock, 30100, manual)).toBeCloseTo(43);
  });
  it('retains legacy unscoped host packets and rejects malformed sequence values', () => {
    const legacy = { ...EMPTY, key: undefined, sessionId: undefined, position: 4, hasTimeline: true };
    expect(acceptClockPacket(packet, legacy, session, 500)?.received).toBe(500);
    for (const sequence of [NaN, Infinity, -1, 1.5]) expect(acceptClockPacket(packet, { ...packet, sequence }, session, 500)).toBeNull();
  });
});
