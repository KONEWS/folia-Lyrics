import { Shuffle } from 'lucide-react';
import type { VisualizerMode, VisualizerBackgroundMode } from '../../types';
import { VisualizerModeGlyph, BackgroundModeGlyph } from '../../components/visualizer/modeGlyphs';
import { RANDOM_VISUALIZER_CHOICE } from '../../components/visualizer/random/lyricStyleChoices';

// Desktop choices show shipped posters; hovering and selecting never mount another renderer.
const pictures = import.meta.glob<string>('./stylePictures/*.png', { eager: true, query: '?url', import: 'default' });
const backgrounds = import.meta.glob<string>('./backgroundPictures/*.png', { eager: true, query: '?url', import: 'default' });

export function drawDesktopStylePicture(mode: VisualizerMode) {
    if (mode === RANDOM_VISUALIZER_CHOICE) return <span className="grid h-full w-full place-items-center text-[color:var(--st-accent)]"><Shuffle size={24}/></span>;
    const source = pictures[`./stylePictures/${mode}.png`];
    return source ? <img src={source} alt="" draggable={false} className="h-full w-full object-cover"/> :
        <span className="grid h-full w-full place-items-center text-[color:var(--st-t2)]"><VisualizerModeGlyph mode={mode} size={22}/></span>;
}

export function drawDesktopBackgroundPicture(mode: VisualizerBackgroundMode) {
    const source = backgrounds[`./backgroundPictures/${mode}.png`];
    return source ? <img src={source} alt="" draggable={false} className="h-full w-full object-cover"/> :
        <span className="grid h-full w-full place-items-center text-[color:var(--st-t2)]"><BackgroundModeGlyph mode={mode} size={22}/></span>;
}
