// native/TrayMenuLayout.cs — shared menu commands and monitor-aware geometry, without window or preference side effects.
namespace FoliaLyrics;
internal enum TrayMenuAction { Show, Restore, Topmost, LyricsSettings, MusicApps, Exit }
internal static class TrayMenuLayout
{
    internal static readonly string[] Labels = ["显示歌词窗口", "恢复鼠标操作", "窗口置顶", "歌词设置", "音乐软件管理", "退出"];
    internal const int Width = 300, Header = 36, Row = 40, Gap = 12, Padding = 6;
    internal const int Height = Padding * 2 + Header + Row * 6 + Gap * 2;
    internal static Rectangle Item(int index, float scale)
    {
        var y = Padding + Header + index * Row + (index >= 3 ? Gap : 0) + (index >= 5 ? Gap : 0);
        return Rectangle.Round(new RectangleF(Padding * scale, y * scale, (Width - Padding * 2) * scale, Row * scale));
    }
    // Both the pointer and working area use the same Windows coordinate space, including negative monitor origins.
    internal static Point Position(Point anchor, Size size, Rectangle area)
    {
        var x = Math.Clamp(anchor.X - size.Width, area.Left, Math.Max(area.Left, area.Right - size.Width));
        var y = Math.Clamp(anchor.Y - size.Height, area.Top, Math.Max(area.Top, area.Bottom - size.Height));
        return new(x, y);
    }
    internal static int Next(int current, int direction) => (current + direction + Labels.Length) % Labels.Length;
}
