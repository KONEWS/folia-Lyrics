// src/types/desktopMusicApps.ts — host-owned player identities and discovery packets shared by desktop views.
export type MusicAppIdentity = { name: string; path: string; icon: string; launchKind?: 'exe' | 'store'; appUserModelId?: string };
export type MusicAppBinding = MusicAppIdentity & { slot: number };
export type MusicAppCandidate = MusicAppIdentity & { id: string };
export type MusicAppDiscovery = { batchId: string; busy: boolean; candidates: MusicAppCandidate[] };
export const EMPTY_MUSIC_APP_DISCOVERY: MusicAppDiscovery = { batchId: '', busy: false, candidates: [] };

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
function identity(value: Record<string, unknown>): MusicAppIdentity | null {
  const launchKind = value.launchKind === 'store' ? 'store' : 'exe';
  const path = typeof value.path === 'string' ? value.path : '';
  const appUserModelId = typeof value.appUserModelId === 'string' ? value.appUserModelId : '';
  if (launchKind === 'store' ? !appUserModelId : !path) return null;
  return { name: typeof value.name === 'string' ? value.name : '', path,
    icon: typeof value.icon === 'string' ? value.icon : '', launchKind, appUserModelId };
}

// Ignore invalid and duplicate entries; only the native host resolves these IDs to an executable or registered app.
export function normalizeMusicApps(value: unknown): MusicAppBinding[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  return value.flatMap(item => {
    if (!record(item) || !Number.isSafeInteger(item.slot) || Number(item.slot) < 0 || Number(item.slot) >= 2147483647) return [];
    const app = identity(item), slot = Number(item.slot);
    if (!app || seen.has(slot)) return [];
    seen.add(slot); return [{ ...app, slot }];
  });
}

export function normalizeMusicAppCandidates(value: unknown): MusicAppCandidate[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap(item => {
    if (!record(item) || typeof item.id !== 'string' || !item.id || item.id.length > 256) return [];
    const app = identity(item);
    if (!app || seen.has(item.id)) return [];
    seen.add(item.id); return [{ ...app, id: item.id }];
  });
}

export function normalizeMusicAppDiscovery(value: Record<string, unknown>): MusicAppDiscovery | null {
  return typeof value.batchId === 'string' && typeof value.busy === 'boolean' && Array.isArray(value.candidates)
    ? { batchId: value.batchId, busy: value.busy, candidates: normalizeMusicAppCandidates(value.candidates) } : null;
}
