import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import zhCN from '../../../src/i18n/locales/zh-CN';
import { buildDesktopSettingsSearchIndex, searchDesktopSettings } from '../../../src/desktopLyrics/desktopSettingsSearchIndex';
import { BUILTIN_VISUALIZER_BACKGROUND_MODES, BUILTIN_VISUALIZER_MODES } from '../../../src/types/visualizerModes';

// test/unit/desktop/desktopSettingsSearch.test.ts — search quality and coverage across panels that are not mounted together.
const index = buildDesktopSettingsSearchIndex();
function translate(key: string): string {
  let value: unknown = zhCN;
  for (const part of key.split('.')) value = (value as Record<string, unknown>)[part];
  return String(value);
}

const PANEL_FILES = [
  'settingsPanels.tsx', 'monet/MonetSettingsPanel.tsx', 'pendolo/PendoloSettingsPanel.tsx',
  'sonnet/SonnetSettingsPanel.tsx', 'tempera/TemperaSettingsPanel.tsx', 'lumiere/LumiereSettingsPanel.tsx',
  'diorama/DioramaGeometrySettings.tsx', 'diorama/DioramaParticleAppearanceSettings.tsx', 'diorama/DioramaEffectSettings.tsx',
  'backgrounds/common/CommonBackgroundSettingsCard.tsx', 'backgrounds/monet/MonetBackgroundSettingsCard.tsx',
  'backgrounds/latent/LatentBackgroundSettingsCard.tsx', 'backgrounds/sora/SoraBackgroundSettingsCard.tsx',
  'backgrounds/nomand/NomandBackgroundSettingsCard.tsx', 'backgrounds/nomand/NomandBackgroundEffectSettings.tsx',
  'backgrounds/nomand/NomandDitheringSettings.tsx', 'backgrounds/nomand/NomandFlutedGlassSettings.tsx',
  'backgrounds/nomand/NomandPaperTextureSettings.tsx', 'backgrounds/nomand/NomandHalftoneDotsSettings.tsx',
  'backgrounds/nomand/NomandLensDistortionSettings.tsx', 'backgrounds/url/UrlBackgroundSettingsCard.tsx',
  'tempera/TemperaImageLayerDialog.tsx', 'tempera/TemperaImagePlacementEditor.tsx',
];

describe('desktop settings search', () => {
  it('indexes every built-in mode and background before their panels are opened', () => {
    expect(new Set(index.filter(entry => entry.mode).map(entry => entry.mode))).toEqual(new Set(BUILTIN_VISUALIZER_MODES));
    expect(new Set(index.filter(entry => entry.background).map(entry => entry.background))).toEqual(new Set(BUILTIN_VISUALIZER_BACKGROUND_MODES));
    expect(new Set(index.map(entry => entry.key)).size).toBe(index.length);
    expect(index.filter(entry => /^(options|desktopVisual|ui|theme)\./.test(entry.label))).toEqual([]);
    expect(index.filter(entry => /[。！？]|\{\{/.test(entry.label))).toEqual([]);
    expect(index.every(entry => entry.breadcrumb && !entry.breadcrumb.endsWith(' · 设置'))).toBe(true);
  });

  it('puts exact control names before a generic section or alias hit', () => {
    expect(searchDesktopSettings(index, '窗口置顶')[0].key).toBe('main.topmost');
    expect(searchDesktopSettings(index, '字体缩放')[0]).toMatchObject({ label: '字体缩放', mode: 'monet' });
    expect(searchDesktopSettings(index, '显示译文')[0].label).toBe('显示译文');
    expect(searchDesktopSettings(index, '  QQ  ')[0]).toMatchObject({ key: 'main.source-qq', label: 'QQ 音乐' });
  });

  it('matches bilingual aliases and all query words across a destination breadcrumb', () => {
    expect(searchDesktopSettings(index, '莫奈背景 背景模糊')).toEqual([
      expect.objectContaining({ label: '背景模糊', background: 'monet', section: 'background' }),
    ]);
    expect(searchDesktopSettings(index, 'background 纹理玻璃').some(entry => entry.background === 'nomand')).toBe(true);
    expect(searchDesktopSettings(index, 'always on top')[0].key).toBe('main.topmost');
    expect(searchDesktopSettings(index, '商籁 RGB').some(entry => entry.mode === 'sonnet' && entry.label === 'RGB 色差')).toBe(true);
    expect(searchDesktopSettings(index, '桌面背景').length).toBeGreaterThan(30);
    expect(searchDesktopSettings(index, '')).toEqual([]);
    expect(searchDesktopSettings(index, '不存在的设置名称')).toEqual([]);
  });

  it('distinguishes repeated labels and carries safe prerequisite destinations', () => {
    const speeds = searchDesktopSettings(index, '基础速度');
    expect(speeds.map(entry => entry.context)).toEqual(['像素背景', '流体背景']);
    expect(searchDesktopSettings(index, '流体背景 基础速度')).toEqual([expect.objectContaining({ context: '流体背景' })]);
    expect(searchDesktopSettings(index, '自定义水洗色')[0].fallback).toBe('水洗色彩');
    expect(searchDesktopSettings(index, '字幕 字体')[0].section).toBe('subtitle');
    expect(index.find(entry => entry.key === 'common.options.fontWeight')?.fallback).toBe('自动字重');
    expect(index.find(entry => entry.key === 'subtitle.options.fontFamily')?.fallback).toBe('字幕继承歌词字体');
    expect(index.find(entry => entry.key === 'subtitle.options.fontWeight')).toMatchObject({ fallback: '自动字重', fallbacks: ['字幕继承歌词字体'] });
    expect(index.find(entry => entry.key === 'visualizer.tempera.options.temperaPostProcessGrain')?.fallback).toBe('整体后处理滤镜');
    expect(index.find(entry => entry.key === 'background.nomand.options.nomandBackgroundFlutedGlassBlur')?.fallback).toBe('纹理玻璃');
    expect(index.find(entry => entry.key === 'background.url.options.urlBackgroundNotePlaceholder')?.fallback).toBe(translate('options.urlBackgroundAdd'));
    expect(index.find(entry => entry.key === 'background.monet.options.monetHalfPaneOffsetX')?.fallback).toBe(translate('options.monetBackgroundLayout'));
    expect(index.find(entry => entry.key === 'background.monet.options.monetBackgroundDriftStrength')?.fallback).toBe(translate('options.monetBackgroundDriftEnabled'));
    expect(index.find(entry => entry.key === 'visualizer.diorama.Soul.dioramaCustomStrength')).toMatchObject({
      context: translate('options.dioramaSoulEffect'), fallback: translate('options.dioramaEffectStrength'), fallbacks: [translate('options.dioramaSoulEffect')],
    });
    expect(index.find(entry => entry.key === 'main.manual-start')).toMatchObject({ fallback: '手动歌词时钟', breadcrumb: '歌词设置 · 歌词同步' });
    expect(index.find(entry => entry.key === 'main.music-app-remove')?.fallback).toBe('音乐软件快捷启动');
    expect(index.find(entry => entry.key === 'main.source-qq')?.fallback).toBe('歌词来源');
    expect(index.find(entry => entry.key === 'main.online-results')?.fallback).toBe('在线歌词');
    expect(index.find(entry => entry.key === 'main.visual-settings')?.label).toBe(translate('desktopVisual.openSettings'));
    expect(index.find(entry => entry.key === 'background.latent.Mesh.latentBaseSpeed')?.breadcrumb).toBe('歌词样式设置 · 背景 · 隐现 · 流体背景');
  });

  it('covers source-declared parameter labels, including list-driven controls and asset dialogs', () => {
    const keys = new Set<string>();
    const missing: string[] = [];
    for (const file of PANEL_FILES) {
      const source = readFileSync(new URL(`../../../src/components/visualizer/${file}`, import.meta.url), 'utf8');
      const panels = file === 'settingsPanels.tsx'
        ? [...source.matchAll(/export const (\w+)SettingsPanel[\s\S]*?(?=export const \w+SettingsPanel|$)/g)]
          .map(match => ({ owner: match[1].toLowerCase(), source: match[0], background: false }))
        : [{ owner: file.split('/')[file.startsWith('backgrounds/') ? 1 : 0], source, background: file.startsWith('backgrounds/') }];
      for (const panel of panels) {
        const declarations = [
          /(?:label|aria-label)=\{(?:props\.)?t\('([^']+)'/g,
          /<(?:span|div)[^>]*>\s*\{(?:props\.)?t\('([^']+)'/g,
          /(?:slider|toggle)\('[^']+',\s*'([^']+)'/g,
        ];
        for (const pattern of declarations) for (const match of panel.source.matchAll(pattern)) {
          const key = match[1];
          if (!key.startsWith('options.') || /(?:Desc|Hint|Warning|Count|Empty|Uploading|Success|Failed|Cleared|Preview|Slot)$/.test(key)) continue;
          keys.add(key);
          if (!index.some(entry => entry.label === translate(key)
            && (panel.background ? entry.background : entry.mode) === panel.owner)) missing.push(`${panel.owner}: ${key}`);
        }
      }
    }
    expect(keys.size).toBeGreaterThan(100);
    expect([...new Set(missing)]).toEqual([]);
  });
});
