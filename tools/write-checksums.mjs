import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// tools/write-checksums.mjs
// 用法：node tools/write-checksums.mjs <发布目录> [文件名...]，默认只校验 FoliaLyrics.exe。
// 输出格式沿用已有的 SHA256SUMS.txt：大写十六进制摘要，两个空格，文件名。
const [folder, ...names] = process.argv.slice(2);
if (!folder) {
  console.error('用法：node tools/write-checksums.mjs <发布目录> [文件名...]');
  process.exit(1);
}
const targets = names.length ? names : ['FoliaLyrics.exe'];
const lines = targets.map(name => {
  const digest = createHash('sha256').update(readFileSync(join(folder, name))).digest('hex').toUpperCase();
  return `${digest}  ${name}`;
});
writeFileSync(join(folder, 'SHA256SUMS.txt'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
