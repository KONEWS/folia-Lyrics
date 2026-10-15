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
        RegisterRecoveryHotkey();
    }
    protected override void OnHandleDestroyed(EventArgs e) { ReleaseRecoveryHotkey(); base.OnHandleDestroyed(e); }
    // Black GDI pixels expose the extended DWM frame behind the transparent WebView.
    protected override void OnPaintBackground(PaintEventArgs e) => e.Graphics.Clear(acrylic || transparentBackground ? Color.Black : BackColor);
}
