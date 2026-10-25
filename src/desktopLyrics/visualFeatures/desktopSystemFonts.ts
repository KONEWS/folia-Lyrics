import i18n from '../../i18n/config';
import { isDesktop, listen, send } from '../bridge';

// Read installed font families through the desktop host, with the browser API available to development previews.
type SystemFont = { family: string };
const RESPONSE_TIMEOUT_MS = 10_000;
let pendingFonts: Promise<SystemFont[]> | null = null;

function readNativeFonts(): Promise<SystemFont[]> {
    return new Promise((resolve, reject) => {
        const requestId = crypto.randomUUID();
        let unsubscribe = () => {};
        const finish = (families?: string[], error?: unknown) => {
            clearTimeout(timer);
            unsubscribe();
            if (error) reject(error);
            else resolve((families ?? []).map(family => ({ family })));
        };
        const timer = setTimeout(() => finish(undefined, new Error(i18n.t('options.systemFontPermissionDenied'))), RESPONSE_TIMEOUT_MS);
        unsubscribe = listen(message => {
            if (message.type !== 'systemFonts' || message.data.requestId !== requestId) return;
            const { families, error } = message.data;
            if (error || !Array.isArray(families) || !families.every(family => typeof family === 'string')) {
                finish(undefined, new Error(i18n.t('options.systemFontPermissionDenied')));
                return;
            }
            finish(families);
        });
        try { send('querySystemFonts', { requestId }); }
        catch (error) { finish(undefined, error); }
    });
}

// Sharing the request prevents StrictMode and multiple typography pickers from enumerating fonts twice.
export function loadDesktopSystemFonts(): Promise<SystemFont[]> {
    if (pendingFonts) return pendingFonts;
    const read = async () => {
        if (isDesktop()) return readNativeFonts();
        const query = (window as Window & { queryLocalFonts?: () => Promise<SystemFont[]> }).queryLocalFonts;
        if (!query) throw new Error(i18n.t('options.systemFontUnsupported'));
        return query.call(window);
    };
    pendingFonts = read().catch(error => {
        pendingFonts = null;
        throw error;
    });
    return pendingFonts;
}
