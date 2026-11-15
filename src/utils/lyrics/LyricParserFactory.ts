import { LyricData } from '../../types';
import { applyLyricDisplayFilter, resolveLyricProcessingOptions } from './filtering';
import { RawLyricSource } from './types';
import { EmbeddedLyricAdapter } from './adapters/EmbeddedLyricAdapter';
import { LocalFileLyricAdapter } from './adapters/LocalFileLyricAdapter';
import { QrcLyricAdapter } from './adapters/QrcLyricAdapter';
import type { LyricProcessingOptions } from './types';

export class LyricParserFactory {
    static async parse(source: RawLyricSource, options: LyricProcessingOptions = {}): Promise<LyricData | null> {
        const resolvedOptions = resolveLyricProcessingOptions(options);
        let parsed: LyricData | null = null;

        switch (source.type) {
            case 'embedded':
                parsed = await new EmbeddedLyricAdapter().parse(source, resolvedOptions);
                break;
            case 'local':
                parsed = await new LocalFileLyricAdapter().parse(source, resolvedOptions);
                break;
            case 'qrc':
                parsed = await new QrcLyricAdapter().parse(source, resolvedOptions);
                break;
            default:
                console.warn('[LyricParserFactory] Unknown lyric source type:', (source as any)?.type);
                return null;
        }

        return applyLyricDisplayFilter(parsed, resolvedOptions.filterPattern);
    }
}
