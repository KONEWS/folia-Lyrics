import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { zipSync } from 'fflate';

// tools/package-web.mjs
// 打包结果必须可复现：native/FoliaLyrics.csproj 会对 web-assets.zip 取 SHA256，程序按这个摘要决定
// 解压到 web/<摘要> 的哪个目录。目录顺序和时间戳每次不同，同一份源码就会得到不同的摘要，
// 用户磁盘上也会多出一份重复解压的界面资源。
const FIXED_MTIME = new Date(2000, 0, 1); // 用本地时间构造，ZIP 里的 DOS 时间在任何时区下都是 2000-01-01 00:00:00。
// public/ 里混入的编辑器备份文件，界面不会引用，没必要进安装包。
const SKIP = /\.(bak|orig|tmp)$/i;

if (!existsSync(join('dist-desktop', 'desktop.html'))) {
  console.error('找不到 dist-desktop/desktop.html，请先运行 npm run build:desktop。');
  process.exit(1);
}

const files = {};
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
// 递归收集目录；readdirSync 的顺序取决于文件系统，按名称排序后压缩包的条目顺序才是确定的。
function collect(folder, prefix = '') {
  for (const f of readdirSync(folder, { withFileTypes: true }).sort(byName)) {
    if (f.isDirectory()) collect(join(folder, f.name), prefix + f.name + '/');
    else if (!SKIP.test(f.name)) files[prefix + f.name] = new Uint8Array(readFileSync(join(folder, f.name)));
  }
}
collect('dist-desktop');
collect('licenses', 'licenses/');
files['licenses/Folia-AGPL-3.0.txt'] = new Uint8Array(readFileSync('LICENSE'));
files['licenses/README-DESKTOP.md'] = new Uint8Array(readFileSync('README-DESKTOP.md'));
writeFileSync('native/web-assets.zip', zipSync(files, { level: 6, mtime: FIXED_MTIME }));
console.log('Web assets and license notices packaged');
