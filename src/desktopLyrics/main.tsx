import React from 'react';
import { createRoot } from 'react-dom/client';
import 'pixi.js/unsafe-eval';
import '../i18n/config';
import '../index.css';
import './glass.css';
import './desktop.css';
import './settings.css';
import './window-chrome.css';
import DesktopLyrics from './DesktopLyrics';
import './reference-glass.css';
import './cover-immersion.css';
import './topbar.css';
import './unified-glass.css';
import './compact-playback.css';
import './desktop-style-controls.css';
import './popup-motion.css';
import './desktop-theme.css';
import './window-follow-menu.css';

// src/desktopLyrics/main.tsx: Install Pixi's CSP-compatible implementation before loading the original renderers.
const render = () => createRoot(document.getElementById('root')!).render(<React.StrictMode><DesktopLyrics/></React.StrictMode>);
// Connect to the host immediately; the lyric stage prepares only the fonts selected for actual lyrics.
render();
