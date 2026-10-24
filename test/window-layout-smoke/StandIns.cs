using System.Drawing;

// test/window-layout-smoke/StandIns.cs — record viewport assignments and deliver native gesture/timer events deterministically.
namespace System.Windows.Forms
{
    internal enum FormWindowState { Normal, Minimized, Maximized }
    internal sealed class Timer : IDisposable
    {
        public int Interval { get; set; }
        public bool Enabled { get; private set; }
        public event EventHandler? Tick;
        public void Start() => Enabled = true;
        public void Stop() => Enabled = false;
        public void Fire() { if (Enabled) Tick?.Invoke(this, EventArgs.Empty); }
        public void Dispose() => Enabled = false;
    }
}
namespace FoliaLyrics
{
    internal sealed class WebBounds
    {
        public bool IsDisposed;
        private Rectangle bounds;
        public List<Rectangle> Changes { get; } = [];
        public Rectangle Bounds { get => bounds; set { bounds = value; Changes.Add(value); } }
    }
    internal sealed partial class MainWindow
    {
        private readonly WebBounds web = new();
        public bool IsDisposed, Disposing;
        public System.Windows.Forms.FormWindowState WindowState;
        public Rectangle ClientRectangle { get; private set; } = new(0, 0, 1200, 760);
        private event EventHandler? ResizeBegin, ResizeEnd, FormClosed;
        public MainWindow() => InitializeWebLayout();
        public WebBounds Web => web;
        public bool Pending => webLayoutTimer.Enabled;
        public void BeginGesture() => ResizeBegin?.Invoke(this, EventArgs.Empty);
        public void EndGesture() => ResizeEnd?.Invoke(this, EventArgs.Empty);
        public void ResizeTo(int width, int height) { ClientRectangle = new(0, 0, width, height); RequestWebLayout(); }
        public void Tick() => webLayoutTimer.Fire();
        public void Close() => FormClosed?.Invoke(this, EventArgs.Empty);
    }
}
