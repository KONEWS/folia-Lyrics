import { describe, expect, it } from 'vitest';
import {
    buildPerfCheckLadder, frameStats, framesSmooth, rateStep, recommendStep, stepSmooth, targetIntervalMs,
} from '@/components/perfCheck/perfCheckPlan';
import type { PerfCheckFrames } from '@/components/perfCheck/perfCheckTypes';

// test/unit/perfCheck/perfCheckPlan.test.ts
// The performance check's arithmetic (src/components/perfCheck/perfCheckPlan.ts): the settings it
// tries and in what order, the frame statistics, what counts as smooth, which step it recommends.

const at120 = { refreshMs: 1000 / 120, autoAntialias: true };

describe('buildPerfCheckLadder', () => {
    it('gives up a little more each step, from the user\'s own settings', () => {
        expect(buildPerfCheckLadder({ frameRate: 'off', scale: 1, antialias: 'auto' }, at120)).toEqual([
            { settings: { frameRate: 'off', scale: 1, antialias: 'auto' }, changes: [] },
            { settings: { frameRate: 'off', scale: 1, antialias: 'off' }, changes: ['antialias'] },
            { settings: { frameRate: 'off', scale: 0.75, antialias: 'off' }, changes: ['scale'] },
            { settings: { frameRate: 60, scale: 0.75, antialias: 'off' }, changes: ['frameRate'] },
            { settings: { frameRate: 60, scale: 0.5, antialias: 'off' }, changes: ['scale'] },
        ]);
    });

    it('leaves out a step that would change nothing', () => {
        expect(buildPerfCheckLadder({ frameRate: 60, scale: 0.5, antialias: 'off' }, at120)).toEqual([
            { settings: { frameRate: 60, scale: 0.5, antialias: 'off' }, changes: [] },
        ]);
        expect(buildPerfCheckLadder({ frameRate: 'off', scale: 0.75, antialias: 'on' }, at120).map(step => step.changes)).toEqual([
            [], ['antialias'], ['frameRate'], ['scale'],
        ]);
        // The desktop limiter carries its target phase: 90 FPS stays distinct from 60 FPS at 120 Hz.
        expect(buildPerfCheckLadder({ frameRate: 90, scale: 0.75, antialias: 'on' }, at120).map(step => step.changes)).toEqual([
            [], ['antialias'], ['frameRate'], ['scale'],
        ]);
    });

    it('leaves out anti-aliasing the reference style already draws without', () => {
        expect(buildPerfCheckLadder({ frameRate: 'off', scale: 1, antialias: 'auto' }, { ...at120, autoAntialias: false }).map(step => step.changes)).toEqual([
            [], ['scale'], ['frameRate'], ['scale'],
        ]);
    });

    it('leaves out a cap of 60 on a display that draws no faster', () => {
        expect(buildPerfCheckLadder({ frameRate: 'off', scale: 0.75, antialias: 'off' }, { refreshMs: 1000 / 60, autoAntialias: false }).map(step => step.changes)).toEqual([
            [], ['scale'],
        ]);
    });
});

describe('frame statistics', () => {
    it('aims at the phase-preserving desktop cap and never above display refresh', () => {
        expect(targetIntervalMs('off', 1000 / 144)).toBeCloseTo(1000 / 144);
        expect(targetIntervalMs(60, 1000 / 120)).toBeCloseTo(1000 / 60);
        expect(targetIntervalMs(60, 1000 / 144)).toBeCloseTo(1000 / 60);
        expect(targetIntervalMs(120, 1000 / 144)).toBeCloseTo(1000 / 120);
        expect(targetIntervalMs(120, 1000 / 60)).toBeCloseTo(1000 / 60);
        expect(targetIntervalMs(60, 1000 / 60)).toBeCloseTo(1000 / 60);
    });

    it('counts frame rate, 1% low and late frames', () => {
        const intervals = [...Array<number>(99).fill(10), 40];
        const stats = frameStats(intervals, 10);
        expect(stats.fps).toBeCloseTo(100 * 1000 / 1030);
        expect(stats.lowFps).toBeCloseTo(25);
        expect(stats.droppedShare).toBeCloseTo(0.01);
        expect(stats.targetFps).toBe(100);
    });

    it('reads no frames as nothing drawn', () => {
        expect(frameStats([], 10)).toEqual({ fps: 0, lowFps: 0, droppedShare: 1, targetFps: 100 });
    });
});

const frames = (fps: number, droppedShare = 0, targetFps = 120): PerfCheckFrames => ({ fps, lowFps: fps, droppedShare, targetFps });

describe('smooth and the recommendation', () => {
    it('is smooth within a tenth of the target and 5% late frames', () => {
        expect(framesSmooth(frames(110))).toBe(true);
        expect(framesSmooth(frames(100))).toBe(false);
        expect(framesSmooth(frames(119, 0.06))).toBe(false);
    });

    it('needs the separation to keep up, unless it did not run', () => {
        expect(stepSmooth(frames(120), { segmentMs: 3500, realtime: 0.84, beatsMs: 100 })).toBe(false);
        expect(stepSmooth(frames(120), { segmentMs: 200, realtime: 14.6, beatsMs: 100 })).toBe(true);
        expect(stepSmooth(frames(120), { segmentMs: null, realtime: null, beatsMs: null })).toBe(true);
    });

    it('says why a step is not smooth', () => {
        const keepsUp = { segmentMs: 200, realtime: 14.6, beatsMs: 100 };
        const behind = { segmentMs: 3500, realtime: 0.84, beatsMs: 100 };
        expect(rateStep({ smooth: true, withAnalysis: frames(120), inference: keepsUp })).toBe('smooth');
        expect(rateStep({ smooth: false, withAnalysis: frames(118), inference: behind })).toBe('behind');
        expect(rateStep({ smooth: false, withAnalysis: frames(95), inference: keepsUp })).toBe('fair');
        expect(rateStep({ smooth: false, withAnalysis: frames(60), inference: behind })).toBe('poor');
    });

    it('recommends the first smooth step, else the closest to its target', () => {
        expect(recommendStep([
            { smooth: false, withAnalysis: frames(60) },
            { smooth: true, withAnalysis: frames(115) },
            { smooth: true, withAnalysis: frames(120) },
        ])).toBe(1);
        expect(recommendStep([
            { smooth: false, withAnalysis: frames(60) },
            { smooth: false, withAnalysis: frames(50, 0, 60) },
            { smooth: false, withAnalysis: frames(70) },
        ])).toBe(1);
    });
});
