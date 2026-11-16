import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { traditionalLocalePlugin } from './dev/i18n/traditionalLocalePlugin.mjs';
import { icuFoliaDataPlugin } from './dev/icuFolia/icuFoliaDataPlugin.mjs';
import { desktopAnalysisModelsPlugin } from './tools/desktopAnalysisModels.mjs';
import { nebbiaStrokesPlugin } from './dev/nebbia/nebbiaStrokesPlugin.mjs';

// vite.desktop.config.ts
const root = path.dirname(fileURLToPath(import.meta.url));
// 桌面程序版本只在 native/FoliaLyrics.csproj 里维护一处，界面页脚等通过 __DESKTOP_VERSION__ 取用，不再手写。
const desktopVersion = readFileSync(path.resolve(root, 'native/FoliaLyrics.csproj'), 'utf8').match(/<Version>\s*([^<\s]+)\s*<\/Version>/)?.[1] ?? '';
export default defineConfig({ plugins: [react(), traditionalLocalePlugin(), icuFoliaDataPlugin(), nebbiaStrokesPlugin(), desktopAnalysisModelsPlugin()], define: { __DESKTOP_VERSION__: JSON.stringify(desktopVersion) },
  resolve: { alias: { '@': path.resolve(root, 'src') } },
  build: { outDir: 'dist-desktop', emptyOutDir: true, rollupOptions: { input: path.resolve(root, 'desktop.html'),
    output: { manualChunks(id) {
      if (id.includes('/node_modules/three/')) return 'three';
      // Keep dynamic icon support without unpacking thousands of tiny icon files on a cold desktop launch.
      const icon = id.match(/\/node_modules\/lucide-react\/dist\/esm\/icons\/([a-z0-9])/);
      return icon ? `lucide-icons-${icon[1]}` : undefined;
    } } } } });
