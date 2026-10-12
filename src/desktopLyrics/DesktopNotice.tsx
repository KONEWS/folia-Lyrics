// src/desktopLyrics/DesktopNotice.tsx — transient and persistent desktop messages with a stable launch-message line break.
const launchSuffix = '，请在播放器中播放歌曲。';

export function getDesktopNoticeLines(text: string) {
  return text.startsWith('已请求打开 ') && text.endsWith(launchSuffix)
    ? [text.slice(0, -launchSuffix.length), launchSuffix.slice(1)] : [text];
}

export default function DesktopNotice({ text, action, onAction }: { text: string; action: string; onAction: () => void }) {
  const lines = getDesktopNoticeLines(text), launch = lines.length === 2;
  return <div className={`desktop-notice desktop-message-notice${launch ? ' desktop-launch-notice' : ''}`} role="status">
    <div className="desktop-notice-message" title={launch ? text : undefined}>
      {lines.map((line, index) => <span key={index} className={launch ? 'desktop-notice-line' : undefined}>{line}</span>)}
    </div><button data-settings-navigation-trigger onClick={onAction}>{action}</button>
  </div>;
}
