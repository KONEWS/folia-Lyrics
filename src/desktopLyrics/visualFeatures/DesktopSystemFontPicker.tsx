import { useMemo } from 'react';
import type { Theme } from '../../types';
import Sheet from '../../components/shared/Sheet';
import { SettingsKitThemeContext } from '../../components/modal/settings/kit/kitTheme';
import FontPicker from '../../components/visualizer/window/FontPicker';
import { useVisualTranslation } from '../DesktopVisualControls';
import { loadDesktopSystemFonts } from './desktopSystemFonts';

// The native font list uses the upstream searchable, virtualized font previews inside the shared desktop dialog.
type Props = {
    theme: Theme;
    family: string | null;
    fallback: string[];
    fontStyle: Theme['fontStyle'];
    onFamily: (family: string | null) => void;
    onFallback: (families: string[]) => void;
    onUpload?: (file: File) => Promise<{ ok: boolean; error?: string }>;
    onClose: () => void;
};

export default function DesktopSystemFontPicker({ theme, family, fallback, fontStyle, onFamily, onFallback, onUpload, onClose }: Props) {
    const t = useVisualTranslation();
    const kitTheme = useMemo(() => ({ theme, isDaylight: false }), [theme]);
    return <SettingsKitThemeContext.Provider value={kitTheme}>
        <Sheet isOpen onClose={onClose} title={t('options.chooseSystemFont')} subtitle={t('options.chooseSystemFontDesc')}
            size="l" body="fill">
            <FontPicker embedded uploadAlongsideFonts loadFonts={loadDesktopSystemFonts} family={family} label={family ?? ''}
                fallbackFamilies={fallback} onFallbackFamiliesChange={onFallback} fontStyle={fontStyle}
                onChoose={font => { onFamily(font.family); onClose(); }}
                onClear={() => onFamily(null)} onUpload={onUpload} onClose={onClose}/>
        </Sheet>
    </SettingsKitThemeContext.Provider>;
}
