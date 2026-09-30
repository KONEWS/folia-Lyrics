import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { parseDesktopLyrics } from '../src/desktopLyrics/parseDesktopLyrics';

// test/onlinePackets.test.ts: Optional real responses from the native live probe; never bundled with source.
const fixtures = process.env.FOLIA_ONLINE_FIXTURES;
it.skipIf(!fixtures).each(['kugou', 'qq', 'netease'])('parses the actual %s response using the original Folia pipeline', async provider => {
  const packet = JSON.parse(readFileSync(resolve(fixtures!, provider + '-packet.json'), 'utf8'));
  const parsed = await parseDesktopLyrics(packet);
  expect(parsed?.lines.length).toBeGreaterThan(10);
  if (provider !== 'netease') expect(parsed?.isWordByWord).toBe(true);
  if (provider === 'netease' || provider === 'qq') expect(parsed?.lines.some(line => Boolean(line.translation))).toBe(true);
});
