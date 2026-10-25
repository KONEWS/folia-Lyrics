import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { copyDesktopAnalysisModels, desktopModelForRequest, DESKTOP_MODEL_FILES } from '../../../tools/desktopAnalysisModels.mjs';

// Desktop build assets share the manifest allowlist and reject changed or incomplete weight files.
const temporary: string[] = [];
afterEach(async () => {
    for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true });
});

describe('desktop analysis model assets', () => {
    it('serves only exact manifest filenames, including harmless query strings', () => {
        const model = DESKTOP_MODEL_FILES[0];
        expect(desktopModelForRequest(`/analysis-models/${model.file}`)).toBe(model);
        expect(desktopModelForRequest(`/analysis-models/${model.file}?check=1`)).toBe(model);
        for (const url of ['/analysis-models/../package.json', '/analysis-models/%2e%2e/package.json',
            '/analysis-models/private.bin', `/analysis-models/${model.file}/extra`, '/package.json']) {
            expect(desktopModelForRequest(url)).toBeNull();
        }
    });

    it('copies verified files and refuses missing, truncated or modified weights', async () => {
        const root = await mkdtemp(join(tmpdir(), 'folia-model-assets-'));
        temporary.push(root);
        const source = join(root, 'models'), output = join(root, 'output');
        await mkdir(source);
        const data = new Uint8Array([1, 2, 3, 4]);
        const model = { file: 'fixture.bin', bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
        await expect(copyDesktopAnalysisModels(source, output, [model])).rejects.toThrow('Missing or incomplete');
        await writeFile(join(source, model.file), data.subarray(1));
        await expect(copyDesktopAnalysisModels(source, output, [model])).rejects.toThrow('Missing or incomplete');
        await writeFile(join(source, model.file), new Uint8Array([4, 3, 2, 1]));
        await expect(copyDesktopAnalysisModels(source, output, [model])).rejects.toThrow('SHA-256');
        await writeFile(join(source, model.file), data);
        await copyDesktopAnalysisModels(source, output, [model]);
        expect(Array.from(await readFile(join(output, model.file)))).toEqual(Array.from(data));
    });
});
