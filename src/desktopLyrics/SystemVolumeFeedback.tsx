import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { listen } from './bridge';

// src/desktopLyrics/SystemVolumeFeedback.tsx
export default function SystemVolumeFeedback() {
  const [volume, setVolume] = useState<{ percent: number; muted: boolean } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = listen(message => {
      if (message.type !== 'systemVolume' || !Number.isFinite(message.data.percent)) return;
      const percent = Math.round(Math.min(100, Math.max(0, message.data.percent))), muted = message.data.muted;
      setVolume(current => current?.percent === percent && current.muted === muted ? current : { percent, muted });
      clearTimeout(timer); timer = setTimeout(() => setVolume(null), 1800);
    });
    return () => { unsubscribe(); clearTimeout(timer); };
  }, []);
  if (!volume) return null;
  return <div className="desktop-notice system-volume-feedback" role="status" aria-live="polite">
    {volume.muted || !volume.percent ? <VolumeX size={18}/> : <Volume2 size={18}/>}
    <span>系统音量 {volume.percent}%{volume.muted ? ' · 静音' : ''}</span>
  </div>;
}
