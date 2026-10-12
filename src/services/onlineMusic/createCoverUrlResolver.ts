import type { SongResult } from '../../types';
import { getSongCoverUrl } from './songMetadata';
import { toSafeRemoteUrl } from '../../utils/appPlaybackHelpers';

// src/services/onlineMusic/createCoverUrlResolver.ts

// Resolves the effective cover URL by preferring the cached cover over remote metadata.
export const createCoverUrlResolver = (
    cachedCoverUrl: string | null,
    currentSong: SongResult | null,
) => {
    return () => {
        if (cachedCoverUrl) return cachedCoverUrl;
        const url = getSongCoverUrl(currentSong) || null;
        return toSafeRemoteUrl(url) || null;
    };
};
