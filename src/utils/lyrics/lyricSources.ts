// Historical identifiers in saved lyric documents and local metadata; desktop requests use the native lyric providers.
export type LyricProviderSource = 'netease' | 'amll' | 'qq' | 'kugou' | 'qishui' | 'spotify';
export type PlatformLyricSource = Exclude<LyricProviderSource, 'amll'>;
