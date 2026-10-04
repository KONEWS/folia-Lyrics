import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// vitest.desktop.config.ts
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'node', include: ['test/desktopClock.test.ts', 'test/onlinePackets.test.ts', 'test/audioProgressSpectrum.test.ts', 'test/desktopCoverTheme.test.ts',
    'test/unit/desktop/desktopStateEquality.test.ts', 'test/unit/desktop/parseDesktopLyrics.test.ts', 'test/unit/desktop/desktopVisualizerClock.test.ts',
    'test/unit/desktop/useCoverTheme.test.ts', 'test/unit/desktop/waitingState.test.ts', 'test/unit/desktop/desktopVisualSettingsCodec.test.ts',
    'test/unit/desktop/pixiFilterResize.test.ts'] },
});
