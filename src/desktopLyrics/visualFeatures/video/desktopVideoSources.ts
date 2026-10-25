// The HTTPS desktop page only accepts secure media URLs or the host's current opaque grant.
export function desktopVideoUrl(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try { return new URL(trimmed).protocol === 'https:' ? trimmed : null; }
    catch { return null; }
}

export const isDesktopVideoFileSource = (value: unknown): value is string => typeof value === 'string'
    && /^https:\/\/folia-video\.local\/__video\/[a-f0-9]{32}$/.test(value);
