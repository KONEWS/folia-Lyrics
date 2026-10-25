import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Vite serves only manifest-named models in development and copies verified weights into desktop builds.
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DESKTOP_MODEL_FILES = JSON.parse(await readFile(join(REPO, 'shared/modelManifest.json'), 'utf8')).models;
const PREFIX = '/analysis-models/';

/** Exact URL matching prevents arbitrary models-directory reads, including encoded traversal. */
export const desktopModelForRequest = url => {
    const pathname = (url ?? '').split('?', 1)[0];
    return DESKTOP_MODEL_FILES.find(model => pathname === `${PREFIX}${model.file}`) ?? null;
};

export async function copyDesktopAnalysisModels(modelsDirectory, outputDirectory, models = DESKTOP_MODEL_FILES) {
    await mkdir(outputDirectory, { recursive: true });
    for (const model of models) {
        const source = join(modelsDirectory, model.file);
        const info = await stat(source).catch(() => null);
        if (!info?.isFile() || info.size !== model.bytes) throw new Error(`[DesktopAnalysis] Missing or incomplete ${model.file}; run npm run models:fetch`);
        const digest = createHash('sha256');
        for await (const chunk of createReadStream(source)) digest.update(chunk);
        if (digest.digest('hex') !== model.sha256) throw new Error(`[DesktopAnalysis] ${model.file} failed SHA-256 verification`);
        await copyFile(source, join(outputDirectory, model.file));
    }
}

/** The native WebView maps dist-desktop to its HTTPS origin, so these files use the same URLs after packaging. */
export function desktopAnalysisModelsPlugin() {
    let root = REPO, output = join(REPO, 'dist-desktop'), building = false;
    return {
        name: 'desktop-analysis-models',
        configResolved(config) {
            root = config.root;
            output = resolve(root, config.build.outDir);
            building = config.command === 'build';
        },
        configureServer(server) {
            server.middlewares.use((request, response, next) => {
                if (!(request.url ?? '').startsWith(PREFIX)) { next(); return; }
                const model = desktopModelForRequest(request.url);
                if (!model) { response.statusCode = 404; response.end(); return; }
                if (request.method !== 'HEAD' && request.method !== 'GET') {
                    response.statusCode = 405; response.setHeader('Allow', 'GET, HEAD'); response.end(); return;
                }
                void (async () => {
                    const source = join(root, 'models', model.file);
                    const info = await stat(source).catch(() => null);
                    if (!info?.isFile() || info.size !== model.bytes) { response.statusCode = 404; response.end(); return; }
                    response.setHeader('Content-Type', 'application/octet-stream');
                    response.setHeader('Content-Length', String(info.size));
                    response.setHeader('Cache-Control', 'no-cache');
                    if (request.method === 'HEAD') { response.end(); return; }
                    const stream = createReadStream(source);
                    stream.on('error', error => { console.warn('[DesktopAnalysis] Model stream failed', error); response.destroy(error); });
                    response.on('close', () => stream.destroy());
                    stream.pipe(response);
                })().catch(error => {
                    console.warn('[DesktopAnalysis] Model request failed', error);
                    if (!response.headersSent) response.statusCode = 500;
                    response.end();
                });
            });
        },
        async writeBundle() {
            if (building) await copyDesktopAnalysisModels(join(root, 'models'), join(output, 'analysis-models'));
        },
    };
}
