import type { Line, LyricBackgroundVocal, SubtitleContentMode } from '../../types';
import { resolveLyricAlternateText, resolveSubtitleContentMode } from '../../utils/lyrics/alternateText';

// src/components/visualizer/harmonyRuntime.ts
// Builds the small discrete state used by the shared top harmony overlay.

export interface ActiveHarmonyLine {
    key: string;
    vocal: LyricBackgroundVocal;
}

export interface HarmonySnapshot {
    signature: string;
    lines: ActiveHarmonyLine[];
}

export const getLineBackgroundVocals = (line: Line | null | undefined): LyricBackgroundVocal[] => {
    if (!line) {
        return [];
    }
    if (line.backgroundVocals?.length) {
        return line.backgroundVocals;
    }
    return line.backgroundVocal ? [line.backgroundVocal] : [];
};

export const getLyricsBackgroundVocals = (lines: Line[]): LyricBackgroundVocal[] =>
    lines
        .flatMap(line => getLineBackgroundVocals(line))
        .sort((left, right) => left.startTime - right.startTime || left.endTime - right.endTime);

// The top harmony overlay keeps a single alternate row; under the 'both' option
// resolveLyricAlternateText collapses to translation, same as the single-track modes.
export const resolveHarmonyAlternateText = (
    vocal: LyricBackgroundVocal,
    subtitleContentMode: SubtitleContentMode | undefined,
    legacyShowTranslation = true,
): string | null => resolveLyricAlternateText(
    vocal,
    resolveSubtitleContentMode(subtitleContentMode, legacyShowTranslation),
);

export const resolveHarmonySnapshotFromVocals = (
    vocals: LyricBackgroundVocal[],
    currentTime: number,
): HarmonySnapshot => {
    const lines = vocals
        .filter(vocal => vocal.text.trim() && currentTime >= vocal.startTime && currentTime <= vocal.endTime)
        .sort((left, right) => left.startTime - right.startTime || left.endTime - right.endTime)
        .map((vocal, index) => ({
            key: `${vocal.startTime}-${vocal.endTime}-${vocal.text}-${index}`,
            vocal,
        }));
    const signature = lines
        .map(entry => entry.key)
        .join('|');

    return { signature, lines };
};

export const resolveHarmonySnapshot = (
    line: Line | null | undefined,
    currentTime: number,
): HarmonySnapshot => resolveHarmonySnapshotFromVocals(getLineBackgroundVocals(line), currentTime);
