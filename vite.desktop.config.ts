import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// vite.desktop.config.ts
const root = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({ plugins: [react()], resolve: { alias: { '@': path.resolve(root, 'src') } },
  build: { outDir: 'dist-desktop', emptyOutDir: true, rollupOptions: { input: path.resolve(root, 'desktop.html'),
    output: { manualChunks(id) { return id.includes('/node_modules/three/') ? 'three' : undefined; } } } } });
