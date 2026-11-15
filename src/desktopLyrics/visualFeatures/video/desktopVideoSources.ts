// Only the host's opaque grant can name a desktop video; saved remote URLs are never used.
export const isDesktopVideoFileSource = (value: unknown): value is string => typeof value === 'string'
    && /^https:\/\/folia-video\.local\/__video\/[a-f0-9]{32}$/.test(value);
