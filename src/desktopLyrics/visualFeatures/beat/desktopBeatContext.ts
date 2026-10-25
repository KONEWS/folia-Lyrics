import { createContext } from 'react';
import type { DesktopBeatController } from './useDesktopBeatFx';

// Shares the current song analysis with the lazily loaded visual settings surface.
export const DesktopBeatContext = createContext<DesktopBeatController | null>(null);
