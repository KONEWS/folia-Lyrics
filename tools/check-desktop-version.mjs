import { readFileSync } from 'node:fs';

// tools/check-desktop-version.mjs
// 桌面程序的版本以 native/FoliaLyrics.csproj 的 <Version> 为准，这里核对随发布包附带的文档是否同步，
// 避免出现“程序 0.4.33、文档仍写 0.4.30”这类错位。README.md 面向已发布的版本，不在检查范围内。
const read = path => readFileSync(path, 'utf8');
const SEMVER = '[0-9]+\\.[0-9]+\\.[0-9]+';

const expected = read('native/FoliaLyrics.csproj').match(new RegExp(`<Version>\\s*(${SEMVER})\\s*</Version>`))?.[1];
if (!expected) {
  console.error('无法从 native/FoliaLyrics.csproj 读取 <Version>。');
  process.exit(1);
}

const problems = [];
const readmeVersion = read('README-DESKTOP.md').match(new RegExp(`^#\\s+folia-Lyrics\\s+(${SEMVER})`, 'm'))?.[1];
if (readmeVersion !== expected) problems.push(`README-DESKTOP.md 标题版本是 ${readmeVersion ?? '（缺失）'}，应为 ${expected}`);

// 变更记录里第一个带版本号的二级标题就是最新版本；“未发布”之类的标题不带版本号，会被自然跳过。
const changelogVersion = read('CHANGELOG-DESKTOP.md').match(new RegExp(`^##\\s+(${SEMVER})`, 'm'))?.[1];
if (changelogVersion !== expected) problems.push(`CHANGELOG-DESKTOP.md 最新版本是 ${changelogVersion ?? '（缺失）'}，应为 ${expected}`);

if (problems.length) {
  console.error(`桌面版本不一致（以 native/FoliaLyrics.csproj 的 ${expected} 为准）：`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`桌面版本一致：${expected}`);
