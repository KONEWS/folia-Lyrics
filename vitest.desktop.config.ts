import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// vitest.desktop.config.ts
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'node', include: ['test/desktopClock.test.ts', 'test/onlinePackets.test.ts'] },
});
