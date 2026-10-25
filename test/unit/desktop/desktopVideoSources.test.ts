import { describe, expect, it } from 'vitest';
import { desktopVideoUrl, isDesktopVideoFileSource } from '../../../src/desktopLyrics/visualFeatures/video/desktopVideoSources';

// Restored settings and native messages must follow the same source rules as user edits.
describe('desktop video sources', () => {
    it('accepts direct HTTPS video links and trims whitespace', () => {
        expect(desktopVideoUrl(' https://example.com/movie.webm?part=2 ')).toBe('https://example.com/movie.webm?part=2');
    });
    it('rejects HTTP links that cannot load reliably from the secure desktop origin', () => {
        expect(desktopVideoUrl('http://example.com/movie.mp4')).toBeNull();
        expect(desktopVideoUrl('http://localhost:8000/movie.mp4')).toBeNull();
    });
    it('never turns saved arbitrary file paths or executable schemes into media requests', () => {
        for (const input of ['', 'C:\\private\\video.mp4', 'file:///C:/private/video.mp4', 'javascript:alert(1)', 'data:video/mp4;base64,AAAA', 'blob:https://example.com/abc', 'movie.webm']) {
            expect(desktopVideoUrl(input)).toBeNull();
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
