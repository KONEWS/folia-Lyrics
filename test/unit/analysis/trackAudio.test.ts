import { describe, expect, it } from 'vitest';
import { toMidSide } from '@/services/analysis/trackAudio';

// Local stereo analysis preserves channel information and never needs an online audio source.
const buffer = (...channels: Float32Array[]) => ({
    length: channels[0].length,
    numberOfChannels: channels.length,
    getChannelData: (channel: number) => channels[channel],
}) as AudioBuffer;

describe('local audio channels', () => {
    it('separates a stereo signal into its center and difference', () => {
        const left = new Float32Array([1, 0.5, -1]);
        const right = new Float32Array([0, 0.5, 1]);
        const { mid, side } = toMidSide(buffer(left, right));
        expect(Array.from(mid)).toEqual([0.5, 0.5, 0]);
        expect(Array.from(side!)).toEqual([0.5, 0, -1]);
        expect(Array.from(left)).toEqual([1, 0.5, -1]);
        expect(Array.from(right)).toEqual([0, 0.5, 1]);
    });
    it('keeps a mono track without inventing a side channel', () => {
        const mono = new Float32Array([0.25, -0.5]);
        const result = toMidSide(buffer(mono));
        expect(result.mid).toEqual(mono);
        expect(result.mid).not.toBe(mono);
        expect(result.side).toBeNull();
    });
});
