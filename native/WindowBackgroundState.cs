using Microsoft.Web.WebView2.Core;

// native/WindowBackgroundState.cs — while the window is minimized the page is hidden, trimmed and no longer fed spectrum frames.
namespace FoliaLyrics;
internal sealed partial class MainWindow
{
    private bool webHidden;
    // WM_SIZE is the only place minimize and restore are reported: the WebView2 child window never receives them. Microsoft's
    // IsVisible guidance is to hide the WebView while the app window is minimized (a hidden page stops requestAnimationFrame and
    // throttles timers); the Low memory target is the documented companion for apps that keep running scripts. Messages posted by
    // the host still reach a hidden page, so the clock and session keep following the player and a restore needs no catch-up.
    private void OnSizeMessage(long sizeType)
    {
        if (WindowBackgroundPolicy.MinimizedFrom(sizeType) is { } minimized) UpdateBackgroundState(minimized);
    }
    // The page's ready handshake (sent again after every reload) and the sound-response toggle re-apply whatever state the window is in now.
    private void ApplyBackgroundStateForCurrentWindow() => UpdateBackgroundState(WindowState == FormWindowState.Minimized);
    // Apply the visible/minimized decision to the spectrum timer and the WebView; safe to call repeatedly and during shutdown.
    private void UpdateBackgroundState(bool minimized)
    {
        if (lifetime.IsCancellationRequested || IsDisposed || Disposing) return;
        var wanted = WindowBackgroundPolicy.SpectrumTimerWanted(ready, preferences.AudioReactive, minimized);
        if (audioTimer.Enabled != wanted) audioTimer.Enabled = wanted;
        UpdateWebVisibility(minimized);
    }
    private void UpdateWebVisibility(bool minimized)
    {
        if (webHidden == minimized || web.IsDisposed || web.CoreWebView2 is null) return;
        webHidden = minimized;
        try
        {
            // Hide first and trim afterwards; on restore raise the memory target first so it is back while the page is shown again.
            if (minimized) { web.Visible = false; SetWebMemoryTarget(CoreWebView2MemoryUsageTargetLevel.Low); }
            else { SetWebMemoryTarget(CoreWebView2MemoryUsageTargetLevel.Normal); web.Visible = true; }
        }
        catch (Exception error)
        {
            // The browser process can be gone (its controller rejects the change). Never let that escape from WndProc; a failed
            // restore stays marked as hidden so the next window-state change tries again instead of leaving the page invisible.
            DataFiles.Log(error);
            if (!minimized) webHidden = true;
            return;
        }
        // Activation can arrive before the control is visible again, which would have left the page without keyboard focus.
        if (!minimized) FocusLyricsIfActive();
    }
    // Best effort: a WebView2 runtime that predates the memory target must not break minimizing or restoring.
    private void SetWebMemoryTarget(CoreWebView2MemoryUsageTargetLevel level)
    {
        try { web.CoreWebView2.MemoryUsageTargetLevel = level; }
        catch (Exception error) { DataFiles.Log(error); }
    }
}
