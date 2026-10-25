import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beginBeatFxTrack, getBeatFxFiredCounts, getBeatFxHeard, isBeatFxHearing, setBeatFxEvents, stopBeatFx, tickBeatFx, tickBeatFxAt } from '@/services/beatFx/beatFxLive';
import { beatImpact } from '@/stores/motionSignals';

// Native audible time uses the same envelopes and seek rules as the original audio deck.
describe('desktop beat clock', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['performance'] });
        stopBeatFx();
        beginBeatFxTrack('desktop');
        setBeatFxEvents('desktop', [{ t: 1, kind: 'beat' }, { t: 2, kind: 'downbeat' }], 'beat_this');
    });
    afterEach(() => { stopBeatFx(); vi.useRealTimers(); });

    it('fires from host time and decays without advancing while paused', () => {
        tickBeatFxAt(0.9);
        tickBeatFxAt(1);
        expect(beatImpact.get()).toBe(1);
        expect(getBeatFxHeard()).toEqual({ key: 'desktop', time: 1 });
        const counts = { ...getBeatFxFiredCounts() };
        vi.advanceTimersByTime(100);
        tickBeatFxAt(null);
        expect(isBeatFxHearing()).toBe(false);
        expect(beatImpact.get()).toBeLessThan(1);
        expect(getBeatFxFiredCounts()).toEqual(counts);
    });

    it('skips past beats on seeks and ignores invalid host times', () => {
        tickBeatFxAt(0);
        const before = { ...getBeatFxFiredCounts() };
        tickBeatFxAt(3);
        expect(getBeatFxFiredCounts()).toEqual(before);
        tickBeatFxAt(Number.NaN);
        expect(isBeatFxHearing()).toBe(false);
        expect(getBeatFxHeard().time).toBeNull();
        tickBeatFxAt(0.9);
        tickBeatFxAt(1);
        expect(getBeatFxFiredCounts().beats).toBe(before.beats + 1);
    });

    it('keeps output latency correction for the original audio player', () => {
        const audio = { currentTime: 1.1, paused: false, ended: false } as HTMLMediaElement;
        tickBeatFx(audio, { baseLatency: 0.04, outputLatency: 0.06 } as unknown as AudioContext);
        expect(getBeatFxHeard().time).toBeCloseTo(1);
        tickBeatFx({ ...audio, paused: true } as HTMLMediaElement, null);
        expect(isBeatFxHearing()).toBe(false);
    });
});
