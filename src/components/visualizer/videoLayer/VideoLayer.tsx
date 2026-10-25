import React, { useContext, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { PlayerState } from '../../../types';
import { currentTime } from '../../../stores/motionSignals';
import { selectDisplayPlayerState, selectDisplaySong, usePlaybackStore } from '../../../stores/usePlaybackStore';
import { ensureVideoLayerFileRestored, useVideoLayerSettingsStore } from '../../../stores/useVideoLayerSettingsStore';
import { VideoLayerPlaybackContext } from './videoLayerPlayback';

// src/components/visualizer/videoLayer/VideoLayer.tsx
// Built-in muted video behind the lyrics (above the background, under the lyrics). The video follows
// playback without any per-frame React work: play/pause follows the player state, a jump in the
// playback clock (seek, song change) re-aligns it, and slow drift is corrected every few seconds.
// The video position is the song position modulo the video length, so a short loop keeps cycling.

const DRIFT_CHECK_MS = 2000;
const DRIFT_TOLERANCE_SEC = 0.35;
// A clock step bigger than this between two ticks is a seek or a song change, not playback.
const CLOCK_JUMP_SEC = 1;

interface VideoLayerProps {
    /** The shell's pause signal (window hidden etc.); the video stops even while music plays. */
    paused: boolean;
}

const VideoLayer: React.FC<VideoLayerProps> = ({ paused }) => {
    const playback = useContext(VideoLayerPlaybackContext);
    const playbackRef = useRef(playback);
    playbackRef.current = playback;
    const clock = playback?.clock ?? currentTime;
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const pausedRef = useRef(paused || playback?.hidden);
    pausedRef.current = paused || playback?.hidden;
    const alignRef = useRef<() => void>(() => {});
    const { enabled, url, opacity, fit, localFileUrl } = useVideoLayerSettingsStore(useShallow(state => ({
        enabled: state.videoLayerEnabled,
        url: state.videoLayerUrl,
        opacity: state.videoLayerOpacity,
        fit: state.videoLayerFit,
        localFileUrl: state.localFileUrl,
    })));
    const source = playback ? playback.localFileUrl ?? playback.url : localFileUrl ?? (url || null);
    const active = enabled && Boolean(source) && !playback?.suppressed;
    const hosted = playback !== null;

    useEffect(() => {
        if (!hosted) ensureVideoLayerFileRestored();
    }, [hosted]);

    useEffect(() => {
        const video = videoRef.current;
        if (!active || !video || !source) return;
        // StrictMode can replay this effect after its cleanup released the same DOM element.
        if (video.getAttribute('src') !== source) video.src = source;
        const isPlaying = () => playbackRef.current?.playing ?? (selectDisplayPlayerState(usePlaybackStore.getState()) === PlayerState.PLAYING);

        const align = () => {
            // Held still while music plays (the shell's pause): the clock runs on, so following it would
            // only seek a stopped video over and over. It is aligned when the pause lifts.
            if (playbackRef.current?.hidden || (pausedRef.current && isPlaying())) return;
            if (!Number.isFinite(video.duration) || video.duration <= 0 || video.seeking) return;
            const target = Math.max(0, clock.get()) % video.duration;
            if (Math.abs(video.currentTime - target) > DRIFT_TOLERANCE_SEC) video.currentTime = target;
        };
        const followState = () => {
            const playing = isPlaying();
            if (playing && !pausedRef.current) void video.play().catch(() => {});
            else video.pause();
        };
        const onMetadata = () => {
            align();
            followState();
        };
        alignRef.current = align;

        video.addEventListener('loadedmetadata', onMetadata);
        if (video.readyState >= HTMLMediaElement.HAVE_METADATA) onMetadata();

        const unsubscribeStore = hosted ? () => {} : usePlaybackStore.subscribe((state, previous) => {
            if (selectDisplayPlayerState(state) !== selectDisplayPlayerState(previous)) followState();
            if (selectDisplaySong(state) !== selectDisplaySong(previous)) align();
        });
        let lastClock = clock.get();
        const unsubscribeClock = clock.on('change', (value) => {
            if (Math.abs(value - lastClock) > CLOCK_JUMP_SEC) align();
            lastClock = value;
        });
        const drift = window.setInterval(align, DRIFT_CHECK_MS);

        return () => {
            window.clearInterval(drift);
            unsubscribeClock();
            unsubscribeStore();
            video.removeEventListener('loadedmetadata', onMetadata);
            video.pause();
            // Leaving a transparent/static surface must also release the decoder and pending media reads.
            video.removeAttribute('src');
            video.load();
        };
    }, [active, source, clock, hosted]);

    // The shell's pause flag changes without touching the source; only play/pause needs to follow.
    useEffect(() => {
        const video = videoRef.current;
        if (!active || !video) return;
        if (paused || playback?.hidden || (playback && !playback.playing)) {
            video.pause();
        } else if (playback?.playing ?? (selectDisplayPlayerState(usePlaybackStore.getState()) === PlayerState.PLAYING)) {
            alignRef.current();
            void video.play().catch(() => {});
        }
    }, [active, paused, playback?.hidden, playback?.playing]);

    if (!active || !source) return null;

    return (
        <video
            ref={videoRef}
            key={source}
            src={source}
            muted
            loop
            playsInline
            preload="auto"
            onError={playback?.onError}
            aria-hidden
            className="absolute inset-0 h-full w-full pointer-events-none"
            style={{ opacity, objectFit: fit }}
        />
    );
};

export default VideoLayer;
