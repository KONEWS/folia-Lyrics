// native/WindowAcrylic.cs
namespace FoliaLyrics;
internal sealed partial class MainWindow
{
    private bool acrylic, transparentBackground;
    private void ApplyAppearance()
    {
        if (!IsHandleCreated || IsDisposed) return;
        var transparent = preferences.TransparentBackground && !SystemInformation.HighContrast;
        if (transparent)
        {
            WindowAcrylic.Apply(Handle, false);
            transparentBackground = WindowTransparency.Apply(Handle, true); acrylic = false;
        }
        else
        {
            WindowTransparency.Apply(Handle, false); transparentBackground = false;
            acrylic = WindowAcrylic.Apply(Handle, !clickThrough && WindowAcrylic.TransparencyEnabled());
        }
        BackColor = acrylic || transparentBackground ? Color.Black : DesktopBackground;
        SendAppearance(); Invalidate();
    }
    private void SendAppearance() => Send("appearance", new { acrylic, transparent = transparentBackground,
        solid = !transparentBackground && (!WindowAcrylic.TransparencyEnabled() || clickThrough || preferences.TransparentBackground), highContrast = SystemInformation.HighContrast });
    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        // Force the initial non-client calculation before DWM exposes the custom title area.
        UpdateFrameStyles(); ApplyAppearance();
        RegisterHotKey(Handle, 1, 0x0001 | 0x0002 | 0x4000, (uint)Keys.L);
    }
    protected override void OnHandleDestroyed(EventArgs e) { UnregisterHotKey(Handle, 1); base.OnHandleDestroyed(e); }
    // Black GDI pixels expose the extended DWM frame behind the transparent WebView.
    protected override void OnPaintBackground(PaintEventArgs e) => e.Graphics.Clear(acrylic || transparentBackground ? Color.Black : BackColor);
}
