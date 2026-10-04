import { useEffect } from 'react';
import { setStatusMessage, useStatusMessage, useStatusMessageStore } from '../stores/useStatusMessageStore';

// src/desktopLyrics/DesktopVisualFeedback.tsx — display the original parameter and asset service feedback in this host.
export default function DesktopVisualFeedback() {
  const message = useStatusMessage();
  useEffect(() => {
    if (!message || message.persistent) return;
    const timer = window.setTimeout(() => {
      if (useStatusMessageStore.getState().message === message) setStatusMessage(null);
    }, message.durationMs ?? 5000);
    return () => window.clearTimeout(timer);
  }, [message]);
  return message ? <p className="desktop-visual-service-feedback" role={message.type === 'error' ? 'alert' : 'status'}>{message.text}</p> : null;
}
