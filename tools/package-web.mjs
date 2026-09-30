import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { zipSync } from 'fflate';

// tools/package-web.mjs
const files = {};
function collect(folder, prefix = '') {
  for (const f of readdirSync(folder, { withFileTypes: true })) {
    if (f.isDirectory()) collect(join(folder, f.name), prefix + f.name + '/');
    else files[prefix + f.name] = new Uint8Array(readFileSync(join(folder, f.name)));
  }
}
collect('dist-desktop');
collect('licenses', 'licenses/');
files['licenses/Folia-AGPL-3.0.txt'] = new Uint8Array(readFileSync('LICENSE'));
files['licenses/README-DESKTOP.md'] = new Uint8Array(readFileSync('README-DESKTOP.md'));
writeFileSync('native/web-assets.zip', zipSync(files, { level: 6 }));
console.log('Web assets and license notices packaged');
