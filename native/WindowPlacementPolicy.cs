using System.Drawing;

// native/WindowPlacementPolicy.cs — restore ordinary window geometry across monitor moves, DPI changes and disconnected displays.
namespace FoliaLyrics;
internal sealed record WindowMonitor(string Name, Rectangle WorkingArea, int Dpi);
internal sealed record ResolvedWindowPlacement(Rectangle Bounds, bool Maximized, WindowMonitor Monitor);
internal static class WindowPlacementPolicy
{
    internal static ResolvedWindowPlacement? Restore(WindowPlacementState? saved, IEnumerable<WindowMonitor> monitors, Size minimum)
    {
        if (saved is null || saved.Width <= 0 || saved.Height <= 0) return null;
        var original = new Rectangle(saved.X, saved.Y, saved.Width, saved.Height);
        var available = monitors.Where(monitor => monitor.WorkingArea.Width > 0 && monitor.WorkingArea.Height > 0).ToArray();
        var target = available.FirstOrDefault(monitor => string.Equals(monitor.Name, saved.Monitor, StringComparison.OrdinalIgnoreCase))
            ?? Nearest(original, available);
        if (target is null) return null;
        var dpi = saved.Dpi is >= 48 and <= 768 ? saved.Dpi : target.Dpi;
        var ratio = target.Dpi is >= 48 and <= 768 ? (double)target.Dpi / dpi : 1;
        var bounds = new Rectangle(Pixel(target.WorkingArea.X + ((double)saved.X - saved.WorkAreaX) * ratio),
            Pixel(target.WorkingArea.Y + ((double)saved.Y - saved.WorkAreaY) * ratio), Pixel(saved.Width * ratio), Pixel(saved.Height * ratio));
        return new(Clamp(bounds, minimum, target.WorkingArea), saved.Maximized, target);
    }
    // Oversized/corrupt bounds cannot hide the title controls; very small work areas take precedence over the usual minimum.
    internal static Rectangle Clamp(Rectangle bounds, Size minimum, Rectangle area)
    {
        var width = Math.Clamp(bounds.Width, Math.Min(Math.Max(1, minimum.Width), area.Width), area.Width);
        var height = Math.Clamp(bounds.Height, Math.Min(Math.Max(1, minimum.Height), area.Height), area.Height);
        return new(Math.Clamp(bounds.X, area.Left, area.Right - width), Math.Clamp(bounds.Y, area.Top, area.Bottom - height), width, height);
    }
    internal static WindowMonitor? Nearest(Rectangle bounds, IEnumerable<WindowMonitor> monitors) => monitors
        .Where(monitor => monitor.WorkingArea.Width > 0 && monitor.WorkingArea.Height > 0)
        .OrderByDescending(monitor => Intersection(bounds, monitor.WorkingArea))
        .ThenBy(monitor => Distance(bounds, monitor.WorkingArea)).FirstOrDefault();
    private static double Intersection(Rectangle left, Rectangle right) =>
        Math.Max(0, Math.Min((double)left.X + left.Width, (double)right.X + right.Width) - Math.Max(left.X, right.X))
        * Math.Max(0, Math.Min((double)left.Y + left.Height, (double)right.Y + right.Height) - Math.Max(left.Y, right.Y));
    private static double Distance(Rectangle left, Rectangle right) =>
        Math.Pow((double)left.X + left.Width / 2d - right.X - right.Width / 2d, 2)
        + Math.Pow((double)left.Y + left.Height / 2d - right.Y - right.Height / 2d, 2);
    private static int Pixel(double value) => (int)Math.Clamp(Math.Round(value), int.MinValue, int.MaxValue);
}
