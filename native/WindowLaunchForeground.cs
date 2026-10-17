// native/WindowLaunchForeground.cs — keep lyrics above a music application briefly while it starts.
namespace FoliaLyrics;
internal sealed partial class MainWindow
{
    private readonly WindowForegroundProtection launchForeground = new();
    private readonly System.Windows.Forms.Timer launchForegroundTimer = new();

    private void InitializeLaunchForeground()
    {
        launchForegroundTimer.Tick += (_, _) => ApplyWindowTopmost();
        Disposed += (_, _) => { launchForeground.Clear(); launchForegroundTimer.Dispose(); };
    }

    private WindowForegroundProtection.Request BeginMusicAppForeground()
    {
        var request = launchForeground.Begin();
        ApplyWindowTopmost();
        if (!Visible) Show();
        if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
        BringLyricsToForeground();
        return request;
    }

    private void RenewMusicAppForeground(WindowForegroundProtection.Request request)
    {
        if (IsDisposed || Disposing || !launchForeground.Renew(request)) return;
        ApplyWindowTopmost();
        // A user who minimized the lyrics during a slow application launch keeps that choice.
        if (Visible && WindowState != FormWindowState.Minimized) BringLyricsToForeground();
    }

    private void CancelMusicAppForeground(WindowForegroundProtection.Request request)
    {
        launchForeground.Cancel(request);
        ApplyWindowTopmost();
    }

    private void BringLyricsToForeground() { BringToFront(); Activate(); FocusLyricsIfActive(); }

    private void ApplyWindowTopmost()
    {
        if (IsDisposed || Disposing) return;
        launchForegroundTimer.Stop();
        var remaining = launchForeground.RemainingMilliseconds();
        TopMost = preferences.Topmost || remaining > 0;
        if (remaining > 0) { launchForegroundTimer.Interval = remaining; launchForegroundTimer.Start(); }
    }

    private void SetTopmostPreference(bool enabled)
    {
        preferences.Topmost = enabled;
        launchForeground.Clear();
        ApplyWindowTopmost();
        SavePreferences();
    }
}
