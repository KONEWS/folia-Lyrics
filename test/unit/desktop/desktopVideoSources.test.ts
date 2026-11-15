import { describe, expect, it } from 'vitest';
import { isDesktopVideoFileSource } from '../../../src/desktopLyrics/visualFeatures/video/desktopVideoSources';

// Restored settings and native messages must follow the same source rules as user edits.
describe('desktop video sources', () => {
    it('never turns saved arbitrary file paths or executable schemes into media requests', () => {
        for (const input of ['', 'C:\\private\\video.mp4', 'file:///C:/private/video.mp4', 'javascript:alert(1)', 'data:video/mp4;base64,AAAA', 'blob:https://example.com/abc', 'movie.webm', 'https://example.com/movie.mp4', 'http://localhost:8000/movie.mp4']) {
            expect(isDesktopVideoFileSource(input)).toBe(false);
        }
    });
    it('only accepts the exact opaque native source shape', () => {
        const source = 'https://folia-video.local/__video/0123456789abcdef0123456789abcdef';
        expect(isDesktopVideoFileSource(source)).toBe(true);
        for (const input of [null, source + '?path=C:/private', source + '/file', source.replace('folia-video.local', 'example.com'), source.replace('https:', 'http:'), source.replace('https:', 'file:'), source.slice(0, -1)]) {
            expect(isDesktopVideoFileSource(input)).toBe(false);
        }
    });
});
