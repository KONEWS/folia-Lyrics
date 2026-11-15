import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The standalone fork keeps lyric HTTP in the native adapters and cannot regain the removed online application by accident.
describe('standalone desktop source boundary', () => {
    it('contains no account, online player, sync, update, remote or extension application', () => {
        for (const path of ['electron/main.cjs', 'src/App.tsx', 'src/library/registry.ts', 'src/mods/ipc.ts',
            'src/services/onlineMusic/omni.ts', 'src/components/login/LoginWindow.tsx', 'sync-server/package.json', 'vercel.json', 'wrangler.jsonc']) {
            expect(existsSync(path), path).toBe(false);
        }
    });
    it('does not install online player, login, cloud AI or updater dependencies', () => {
        const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
        const dependencies = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies };
        for (const name of ['electron', 'electron-builder', 'electron-store', 'electron-updater', '@google/genai',
            '@neteasecloudmusicapienhanced/api', '@yakult-green-tea/qq-music-api', 'kugoumusicapi', 'qishui-music-api',
            'bodian-music-api', 'youtubei.js', '@lox-audioserver/node-librespot', '@xhayper/discord-rpc']) {
            expect(dependencies, name).not.toHaveProperty(name);
        }
    });
    it('keeps native HTTP creation inside the lyric transport', () => {
        const collect = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
            const file = join(directory, entry.name);
            return entry.isDirectory() && !['bin', 'obj'].includes(entry.name) ? collect(file)
                : entry.isFile() && file.endsWith('.cs') ? [file] : [];
        });
        const clients = collect('native').filter(file => /\b(?:HttpClient|HttpWebRequest|WebRequest)\b/.test(readFileSync(file, 'utf8')));
        expect(clients.map(file => file.replaceAll('\\', '/'))).toEqual(['native/Online/OnlineHttp.cs']);
    });
});
