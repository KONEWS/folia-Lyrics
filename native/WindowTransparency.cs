using System.Runtime.InteropServices;

// native/WindowTransparency.cs: expose the desktop through WebView alpha without fading the lyric foreground.
namespace FoliaLyrics;
internal static class WindowTransparency
{
    public static bool Apply(IntPtr window, bool enabled)
    {
        var blur = new BlurBehind { Flags = 1, Enable = enabled ? 1 : 0 };
        var result = DwmEnableBlurBehindWindow(window, ref blur);
        var margins = new Margins(enabled ? -1 : 0);
        return DwmExtendFrameIntoClientArea(window, ref margins) >= 0 && result >= 0 && enabled;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct BlurBehind { public uint Flags; public int Enable; public IntPtr Region; public int TransitionOnMaximized; }
    [StructLayout(LayoutKind.Sequential)]
    private struct Margins(int value) { public int Left = value, Right = value, Top = value, Bottom = value; }
    [DllImport("dwmapi.dll")] private static extern int DwmEnableBlurBehindWindow(IntPtr window, ref BlurBehind blur);
    [DllImport("dwmapi.dll")] private static extern int DwmExtendFrameIntoClientArea(IntPtr window, ref Margins margins);
}
