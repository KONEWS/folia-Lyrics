import type { VisualizerMode } from '../types';

// src/utils/visualizerModeLabel.ts
// 让 store / hook 这类叶子层读取「模式的本地化名称」，而不必依赖 components/visualizer/registry。
// registry 在模块初始化时登记解析函数（见 registry.tsx），所以 mod 投稿的模式也能解析；
// 登记前（或测试里没加载 registry）退化为模式 id 本身。

type VisualizerModeLabelResolver = (mode: VisualizerMode, t: (key: string) => string) => string;

let resolver: VisualizerModeLabelResolver | null = null;

/** 由 visualizer registry 调用，登记真正的名称解析函数。 */
export const registerVisualizerModeLabelResolver = (next: VisualizerModeLabelResolver) => {
    resolver = next;
};

/** 返回模式的本地化名称；registry 尚未登记时返回模式 id。 */
export const resolveVisualizerModeLabel = (mode: VisualizerMode, t: (key: string) => string): string =>
    resolver ? resolver(mode, t) : mode;
