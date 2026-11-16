import { describe, expect, it, vi } from 'vitest';
import { createSceneFrameLoop } from '../../../src/components/scenes/engine/sceneFrameLoop';
import { createIntermission } from '../../../src/components/scenes/cinema/cinemaIntermission';

// The scene host sleeps after pause transitions and stops queued work when hidden.
const scheduler = () => {
    let id = 0;
    const pending = new Map<number, FrameRequestCallback>();
    return {
        pending,
        request: (frame: FrameRequestCallback) => { pending.set(++id, frame); return id; },
        cancel: (handle: number) => { pending.delete(handle); },
        flush: (now: number) => { const queued = [...pending.values()]; pending.clear(); queued.forEach(frame => frame(now)); },
    };
};

describe('scene frame demand', () => {
    it('coalesces invalidations and wakes a settled scene for one update', () => {
        const clock = scheduler();
        const frame = vi.fn(() => false);
        const loop = createSceneFrameLoop(frame, () => true, clock.request, clock.cancel);
        loop.wake(); loop.wake();
        expect(clock.pending.size).toBe(1);
        clock.flush(10);
        expect(frame).toHaveBeenCalledTimes(1);
        expect(clock.pending.size).toBe(0);
        loop.wake(); clock.flush(20);
        expect(frame).toHaveBeenCalledTimes(2);
        loop.dispose();
    });

    it('cancels hidden frames, resumes on demand and releases pending work', () => {
        const clock = scheduler();
        let visible = true;
        const frame = vi.fn(() => true);
        const loop = createSceneFrameLoop(frame, () => visible, clock.request, clock.cancel);
        loop.wake(); clock.flush(10);
        expect(clock.pending.size).toBe(1);
        visible = false; loop.wake();
        expect(clock.pending.size).toBe(0);
        clock.flush(20);
        expect(frame).toHaveBeenCalledTimes(1);
        visible = true; loop.wake();
        expect(clock.pending.size).toBe(1);
        loop.dispose();
        expect(clock.pending.size).toBe(0);
        loop.wake();
        expect(clock.pending.size).toBe(0);
    });
});

describe('cinema pause settling', () => {
    it('keeps the pause delay and moving curtains alive, then becomes idle', () => {
        const show = createIntermission();
        show.step(0, true, false);
        expect(show.settled()).toBe(true);
        show.step(0.1, false, false);
        expect(show.settled()).toBe(false);
        for (let i = 0; i < 1200 && !show.settled(); i += 1) show.step(0.1, false, false);
        expect(show.settled()).toBe(true);
        expect(show.step(0, false, false).shutter).toBe(0);
    });

    it('does not keep animating a static or curtain-free pause', () => {
        const show = createIntermission();
        show.step(0.1, false, false, false, false);
        expect(show.settled()).toBe(true);
        show.step(0.1, false, true, true);
        expect(show.settled()).toBe(true);
    });
});
