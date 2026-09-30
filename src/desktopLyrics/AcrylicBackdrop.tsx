// src/desktopLyrics/AcrylicBackdrop.tsx
export default function AcrylicBackdrop({ cover }: { cover: string }) {
  return <div className="acrylic-backdrop" aria-hidden="true">
    <div className="ambient-ribbon ribbon-one"/><div className="ambient-ribbon ribbon-two"/>
    {cover ? <img className="ambient-cover" src={cover} alt=""/> : null}
    <div className="acrylic-wash"/><div className="acrylic-grain"/>
  </div>;
}
