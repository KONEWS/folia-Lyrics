using System.Drawing.Drawing2D;
using System.Drawing.Text;

// native/TrayMenuDrawing.cs — render the approved six-row tray menu without WebView or an animation loop.
namespace FoliaLyrics;
internal static class TrayMenuDrawing
{
    internal static void Draw(Graphics graphics, float scale, bool acrylic, bool topmost, int selected, bool recoveryShortcutAvailable = true)
    {
        var contrast = SystemInformation.HighContrast;
        var foreground = contrast ? SystemColors.MenuText : Color.FromArgb(240, 243, 252);
        var muted = contrast ? SystemColors.MenuText : Color.FromArgb(180, 191, 213);
        graphics.Clear(acrylic ? Color.Transparent : contrast ? SystemColors.Menu : Color.FromArgb(35, 38, 48));
        graphics.SmoothingMode = SmoothingMode.AntiAlias;
        graphics.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
        graphics.ScaleTransform(scale, scale);
        using var body = new Font("Microsoft YaHei UI", 13, FontStyle.Regular, GraphicsUnit.Pixel);
        using var small = new Font("Microsoft YaHei UI", 11, FontStyle.Regular, GraphicsUnit.Pixel);
        Text(graphics, "Folia 桌面歌词", small, muted, new(18, 6, 260, TrayMenuLayout.Header));
        for (var index = 0; index < TrayMenuLayout.Labels.Length; index++)
        {
            var physical = TrayMenuLayout.Item(index, 1);
            var row = new RectangleF(physical.X, physical.Y, physical.Width, physical.Height);
            var color = foreground;
            if (index == selected)
            {
                using var brush = new SolidBrush(contrast ? SystemColors.Highlight : Color.FromArgb(28, 255, 255, 255));
                using var shape = Rounded(row, 6); graphics.FillPath(brush, shape);
                if (contrast) color = SystemColors.HighlightText;
            }
            Icon(graphics, (TrayMenuAction)index, new(17, row.Y + 11, 18, 18), color);
            Text(graphics, TrayMenuLayout.Labels[index], body, color, new(47, row.Y, 169, row.Height));
            if (index == 1 && recoveryShortcutAvailable) Text(graphics, "Ctrl+Alt+L", small, index == selected && contrast ? color : muted, new(214, row.Y, 67, row.Height), true);
            if (index == 2) Text(graphics, topmost ? "开启 ✓" : "关闭", small, index == selected && contrast ? color : muted, new(225, row.Y, 56, row.Height), true);
        }
        using var line = new Pen(contrast ? SystemColors.MenuText : Color.FromArgb(35, 220, 230, 250));
        foreach (var index in new[] { 3, 5 })
        {
            var y = TrayMenuLayout.Item(index, 1).Top - TrayMenuLayout.Gap / 2;
            graphics.DrawLine(line, 14, y, TrayMenuLayout.Width - 14, y);
        }
    }
    private static void Text(Graphics graphics, string text, Font font, Color color, RectangleF bounds, bool right = false)
    {
        using var brush = new SolidBrush(color);
        using var format = new StringFormat(StringFormat.GenericTypographic) { LineAlignment = StringAlignment.Center,
            Alignment = right ? StringAlignment.Far : StringAlignment.Near, FormatFlags = StringFormatFlags.NoWrap, Trimming = StringTrimming.EllipsisCharacter };
        graphics.DrawString(text, font, brush, bounds, format);
    }
    private static GraphicsPath Rounded(RectangleF bounds, float radius)
    {
        var path = new GraphicsPath(); var diameter = radius * 2;
        path.AddArc(bounds.Left, bounds.Top, diameter, diameter, 180, 90);
        path.AddArc(bounds.Right - diameter, bounds.Top, diameter, diameter, 270, 90);
        path.AddArc(bounds.Right - diameter, bounds.Bottom - diameter, diameter, diameter, 0, 90);
        path.AddArc(bounds.Left, bounds.Bottom - diameter, diameter, diameter, 90, 90); path.CloseFigure(); return path;
    }
    // Small vector strokes stay crisp at each DPI and share the same foreground/high-contrast colors as the labels.
    private static void Icon(Graphics graphics, TrayMenuAction action, RectangleF bounds, Color color)
    {
        var state = graphics.Save(); graphics.TranslateTransform(bounds.Left, bounds.Top);
        using var pen = new Pen(color, 1.4f) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round };
        switch (action)
        {
            case TrayMenuAction.Show:
            case TrayMenuAction.MusicApps:
                graphics.DrawRectangle(pen, 1, 2, 16, 13); graphics.DrawLine(pen, 1, 6, 17, 6);
                if (action == TrayMenuAction.MusicApps) { graphics.DrawLine(pen, 6, 10, 12, 10); graphics.DrawLine(pen, 9, 7, 9, 13); }
                break;
            case TrayMenuAction.Restore:
                graphics.DrawLines(pen, new PointF[] { new(2, 1), new(14, 10), new(8, 11), new(5, 17), new(2, 1) }); break;
            case TrayMenuAction.Topmost:
                graphics.DrawLines(pen, new PointF[] { new(6, 1), new(14, 1), new(12, 6), new(15, 10), new(3, 10), new(6, 6), new(6, 1) });
                graphics.DrawLine(pen, 9, 10, 9, 17); break;
            case TrayMenuAction.LyricsSettings:
                for (var y = 3; y < 18; y += 6) graphics.DrawLine(pen, 1, y, 17, y);
                graphics.DrawEllipse(pen, 4, 1, 4, 4); graphics.DrawEllipse(pen, 10, 7, 4, 4); graphics.DrawEllipse(pen, 5, 13, 4, 4); break;
            case TrayMenuAction.Exit:
                graphics.DrawLines(pen, new PointF[] { new(7, 2), new(2, 2), new(2, 16), new(7, 16) });
                graphics.DrawLine(pen, 7, 9, 17, 9); graphics.DrawLines(pen, new PointF[] { new(13, 5), new(17, 9), new(13, 13) }); break;
        }
        graphics.Restore(state);
    }
}
