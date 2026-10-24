// native/WindowWebLayout.cs — bound expensive WebView viewport changes during native edge drags, retaining the last usable viewport while minimized.
namespace FoliaLyrics;
internal sealed partial class MainWindow
{
    private readonly System.Windows.Forms.Timer webLayoutTimer = new() { Interval = 16 };
    private bool interactiveWebLayout;
    private void InitializeWebLayout()
    {
        webLayoutTimer.Tick += (_, _) => ApplyWebBounds();
        ResizeBegin += (_, _) => interactiveWebLayout = true;
        ResizeEnd += (_, _) => { interactiveWebLayout = false; ApplyWebBounds(); };
        FormClosed += (_, _) => webLayoutTimer.Dispose();
        ApplyWebBounds();
    }
    // Native resize messages can arrive faster than the renderer can lay out a lyric scene. Coalesce them to the latest rectangle.
    private void RequestWebLayout()
    {
        if (IsDisposed || Disposing || web.IsDisposed || WindowState == FormWindowState.Minimized) return;
        if (!interactiveWebLayout) { ApplyWebBounds(); return; }
        if (!webLayoutTimer.Enabled) webLayoutTimer.Start();
    }
    private void ApplyWebBounds()
    {
        webLayoutTimer.Stop();
        if (IsDisposed || Disposing || web.IsDisposed || WindowState == FormWindowState.Minimized) return;
        var bounds = ClientRectangle;
        if (bounds.Width > 0 && bounds.Height > 0 && web.Bounds != bounds) web.Bounds = bounds;
    }
}
