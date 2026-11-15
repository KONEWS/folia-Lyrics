// Local audio decoding for user-selected analysis files; no online playback or downloading.

/**
 * Decodes straight to an analysis rate.
 *
 * decodeAudioData resamples to the context's own sample rate, so a context created at 22.05kHz
 * does the downsampling in the decoder - no render pass, no resampler here, and a four-minute
 * track lands as ~10MB of floats instead of ~80MB.
 */
export const decodeAtRate = async (bytes: ArrayBuffer, sampleRate: number): Promise<AudioBuffer | null> => {
    if (typeof window === 'undefined') return null;
    const OfflineContext = window.OfflineAudioContext
        || (window as Window & { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!OfflineContext) return null;
    try {
        return await new OfflineContext(1, 1, sampleRate).decodeAudioData(bytes);
    } catch (error) {
        console.warn('[Analysis] could not decode a track', error);
        return null;
    }
};

/**
 * Splits a decode into mid and side.
 *
 * Mid - (L+R)/2 - is the mono sum every other measurement wants. Side - (L-R)/2 - is what is left
 * when the two channels cancel: everything the mix placed off-centre. Keeping it is what makes a voice
 * findable - lead vocals are panned dead centre on essentially every commercial master, so they live
 * almost entirely in mid and almost not at all in side. Cancelling one against the other is the same
 * arithmetic karaoke machines have used to drop the lead vocal for decades.
 *
 * Null side for a mono file: no two channels to cancel, so the question cannot be asked.
 */
export const toMidSide = (buffer: AudioBuffer): { mid: Float32Array; side: Float32Array | null } => {
    const left = buffer.getChannelData(0);
    if (buffer.numberOfChannels < 2) return { mid: Float32Array.from(left), side: null };

    const right = buffer.getChannelData(1);
    const mid = new Float32Array(buffer.length);
    const side = new Float32Array(buffer.length);
    for (let index = 0; index < mid.length; index += 1) {
        mid[index] = (left[index] + right[index]) / 2;
        side[index] = (left[index] - right[index]) / 2;
    }
    return { mid, side };
};
