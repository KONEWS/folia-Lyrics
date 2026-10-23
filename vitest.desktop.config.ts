import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { traditionalLocalePlugin } from './dev/i18n/traditionalLocalePlugin.mjs';
import { icuFoliaDataPlugin } from './dev/icuFolia/icuFoliaDataPlugin.mjs';

// vitest.desktop.config.ts
// test/unit/desktop 下的用例用通配符收录：以前逐个列文件名，新增的测试文件会被悄悄漏掉。
export default defineConfig({
  plugins: [traditionalLocalePlugin(), icuFoliaDataPlugin()],
  define: { __BUILD_KIND__: JSON.stringify('fork'), __BUILD_HOST__: JSON.stringify('') },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'node', include: ['test/desktopClock.test.ts', 'test/onlinePackets.test.ts', 'test/audioProgressSpectrum.test.ts', 'test/desktopCoverTheme.test.ts',
    'test/unit/desktop/**/*.test.ts', 'test/unit/utils/colorExtractor.test.ts'] },
});
