import type { ReactNode } from 'react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n/config';

// src/desktopLyrics/DesktopVisualLanguage.tsx — reuse upstream resources without changing the app or saved language preference.
const chinese = createInstance({ resources: i18n.options.resources, lng: 'zh-CN', fallbackLng: 'zh-CN',
  defaultNS: 'translation', initAsync: false, interpolation: { escapeValue: false } });
void chinese.init();

export default function DesktopVisualLanguage({ children }: { children: ReactNode }) {
  return <I18nextProvider i18n={chinese}>{children}</I18nextProvider>;
}
