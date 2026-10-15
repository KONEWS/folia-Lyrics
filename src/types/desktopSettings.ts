// src/types/desktopSettings.ts — typed destinations shared by desktop notices and settings entry points.
export type DesktopSettingsTarget =
  | { id: 'player-source' | 'music-apps' | 'music-app-add' | 'manual-clock' | 'online-search' | 'online-sources'
      | 'online-results' | 'local-import' | 'local-folders' | 'audio' | 'segmentation' | 'visual-settings' | 'background-settings' | 'diagnostics' }
  | { id: 'music-app-binding'; slot: number };
export type DesktopSettingsRequest = { sequence: number; target: DesktopSettingsTarget };
export type DesktopNoticeData = { text: string; target?: DesktopSettingsTarget };

const simpleTargets = new Set(['player-source', 'music-apps', 'music-app-add', 'manual-clock', 'online-search', 'online-sources',
  'online-results', 'local-import', 'local-folders', 'audio', 'segmentation', 'visual-settings', 'background-settings', 'diagnostics']);

export function normalizeDesktopSettingsTarget(value: unknown): DesktopSettingsTarget | undefined {
  if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'string') return undefined;
  if (simpleTargets.has(value.id)) return { id: value.id } as DesktopSettingsTarget;
  if (value.id === 'music-app-binding' && 'slot' in value && typeof value.slot === 'number' && Number.isSafeInteger(value.slot) && value.slot >= 0)
    return { id: 'music-app-binding', slot: value.slot };
  return undefined;
}
