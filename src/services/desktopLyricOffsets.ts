import { normalizeDesktopLyricOffset, type DesktopOffsetIdentity, type DesktopOffsetSaved } from '../utils/lyrics/desktopLyricOffset';

// src/services/desktopLyricOffsets.ts — isolated version offsets with a single owner for each legacy calibration.
export type DesktopOffsetStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const claimKey = (identity: DesktopOffsetIdentity) => `folia.desktop.offset.v2.claim:${identity.legacyKey}`;
const readNumber = (value: string | null): number | null => {
  if (value === null || !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? normalizeDesktopLyricOffset(number) : null;
};

export function readDesktopLyricOffset(storage: DesktopOffsetStorage, identity: DesktopOffsetIdentity): DesktopOffsetSaved {
  if (!identity.key) return { value: null, legacy: false };
  try {
    const saved = readNumber(storage.getItem(identity.key));
    if (saved !== null) return { value: saved, legacy: false };
    const owner = storage.getItem(claimKey(identity));
    const value = !owner || owner === identity.key ? readNumber(storage.getItem(identity.legacyKey)) : null;
    return { value, legacy: value !== null };
  } catch { return { value: null, legacy: false }; }
}

// Claim before saving: even interrupted migration cannot copy a legacy value to a second version.
export function writeDesktopLyricOffset(storage: DesktopOffsetStorage, identity: DesktopOffsetIdentity,
  offset: number, previousKey = ''): boolean {
  if (!identity.key) return false;
  try {
    const ownerKey = claimKey(identity), owner = storage.getItem(ownerKey);
    if ((!owner || owner === previousKey) && readNumber(storage.getItem(identity.legacyKey)) !== null)
      storage.setItem(ownerKey, identity.key);
    storage.setItem(identity.key, String(normalizeDesktopLyricOffset(offset)));
    if (previousKey && previousKey !== identity.key) storage.removeItem(previousKey);
    return true;
  } catch { return false; }
}
