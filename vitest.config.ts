import { defineConfig, mergeConfig } from 'vitest/config';
import desktopConfig from './vitest.desktop.config.ts';

// The maintained suite covers the standalone desktop host, lyric parsers and visualizer logic.
export default mergeConfig(desktopConfig, defineConfig({
    test: {
        include: ['test/unit/**/*.test.ts', 'test/desktopClock.test.ts', 'test/onlinePackets.test.ts',
            'test/audioProgressSpectrum.test.ts', 'test/desktopCoverTheme.test.ts'],
    },
}));
