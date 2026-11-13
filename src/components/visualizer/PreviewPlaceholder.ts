import { type Line, type VisualizerMode } from '../../types';
import { getLineRenderEndTime } from '../../utils/lyrics/renderHints';
import placeholderCoverUrl from '../../../assets/placeholder_cover.jpg';
import placeholderCover2Url from '../../../assets/placeholder_cover-2.jpg';
import { getVisualizerPreviewStartOffset } from './registry';
import odo from './previewSongs/odo.json';
import hoshifuruUmi from './previewSongs/hoshifuruUmi.json';

// Lyric-only preview songs shared by the style studio and theme editor; no audio files are bundled.

export type PreviewPlaceholderId = 'default' | 'reserved';

export interface PreviewPlaceholder {
    id: PreviewPlaceholderId;
    title: string;
    artist: string;
    lines: Line[];
    loopDuration: number;
    coverUrl: string;
}

export const VIS_PLAYGROUND_PREVIEW_PLACEHOLDERS: Record<PreviewPlaceholderId, PreviewPlaceholder> = {
    default: {
        id: 'default',
        title: odo.title,
        artist: odo.artist,
        lines: odo.lines,
        loopDuration: odo.loopDuration,
        coverUrl: placeholderCoverUrl,
    },
    reserved: {
        id: 'reserved',
        title: hoshifuruUmi.title,
        artist: hoshifuruUmi.artist,
        lines: hoshifuruUmi.lines,
        loopDuration: hoshifuruUmi.loopDuration,
        coverUrl: placeholderCover2Url,
    },
};

export const VIS_PLAYGROUND_PREVIEW_LINES = VIS_PLAYGROUND_PREVIEW_PLACEHOLDERS.default.lines;
export const VIS_PLAYGROUND_PREVIEW_LOOP_DURATION = VIS_PLAYGROUND_PREVIEW_PLACEHOLDERS.default.loopDuration;
export const VIS_PLAYGROUND_PREVIEW_COVER_URL = VIS_PLAYGROUND_PREVIEW_PLACEHOLDERS.default.coverUrl;

export const getPreviewPlaceholderStartOffset = (mode: VisualizerMode, loopDuration: number) =>
    getVisualizerPreviewStartOffset(mode, loopDuration);

export const findPreviewPlaceholderLineIndex = (lines: Line[], time: number) => {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = lines[index];
        if (!line || time < line.startTime) {
            continue;
        }

        if (time <= getLineRenderEndTime(line)) {
            return index;
        }
    }

    return -1;
};
