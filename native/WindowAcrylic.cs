using Microsoft.Win32;
using System.Runtime.InteropServices;

// native/WindowAcrylic.cs
namespace FoliaLyrics;
internal static class WindowAcrylic
{
    private const int DarkMode = 20, CornerPreference = 33, SystemBackdrop = 38;
    private const int NoBackdrop = 1, DesktopAcrylic = 3;
    public static bool TransparencyEnabled()
    {
        if (SystemInformation.HighContrast) return false;
        try { return Registry.GetValue(@"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize", "EnableTransparency", 1) is not int value || value != 0; }
        catch { return false; }
    }
    // Extend the DWM frame across the client area only when desktop acrylic is available.
    public static bool Apply(IntPtr window, bool enabled)
    {
        if (!OperatingSystem.IsWindowsVersionAtLeast(10, 0, 22000)) return false;
        var dark = SystemInformation.HighContrast ? 0 : 1; var round = 2;
        DwmSetWindowAttribute(window, DarkMode, ref dark, sizeof(int));
        DwmSetWindowAttribute(window, CornerPreference, ref round, sizeof(int));
        if (!OperatingSystem.IsWindowsVersionAtLeast(10, 0, 22621)) return false;
        var material = enabled ? DesktopAcrylic : NoBackdrop;
        var applied = DwmSetWindowAttribute(window, SystemBackdrop, ref material, sizeof(int)) >= 0 && enabled;
        var frame = applied ? new Margins(-1) : new Margins(0);
        if (DwmExtendFrameIntoClientArea(window, ref frame) < 0) applied = false;
        if (!applied)
        {
            material = NoBackdrop; frame = new(0);
            DwmSetWindowAttribute(window, SystemBackdrop, ref material, sizeof(int));
            DwmExtendFrameIntoClientArea(window, ref frame);
        }
        return applied;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct Margins(int value) { public int Left = value, Right = value, Top = value, Bottom = value; }
    [DllImport("dwmapi.dll")] private static extern int DwmSetWindowAttribute(IntPtr window, int attribute, ref int value, int size);
    [DllImport("dwmapi.dll")] private static extern int DwmExtendFrameIntoClientArea(IntPtr window, ref Margins margins);
}
internal sealed partial class MainWindow
{
    private bool acrylic;
    private void ApplyAppearance()
    {
        if (!IsHandleCreated || IsDisposed) return;
        acrylic = WindowAcrylic.Apply(Handle, !clickThrough && WindowAcrylic.TransparencyEnabled());
        BackColor = acrylic ? Color.Black : Color.FromArgb(24, 31, 42);
        SendAppearance(); Invalidate();
    }
    private void SendAppearance() => Send("appearance", new { acrylic, solid = !WindowAcrylic.TransparencyEnabled() || clickThrough, highContrast = SystemInformation.HighContrast });
    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e); ApplyAppearance();
        RegisterHotKey(Handle, 1, 0x0001 | 0x0002 | 0x4000, (uint)Keys.L);
    }
    protected override void OnHandleDestroyed(EventArgs e) { UnregisterHotKey(Handle, 1); base.OnHandleDestroyed(e); }
    // Black GDI pixels expose the extended DWM frame behind the transparent WebView.
    protected override void OnPaintBackground(PaintEventArgs e) => e.Graphics.Clear(acrylic ? Color.Black : BackColor);
}
