// test/window-background-smoke/StandIns.cs — just enough of the form, timer, WebView2 control and logger for the real WindowBackgroundState.cs to run anywhere.
// Every observable side effect (timer, visibility, memory target, focus) is appended to one ordered event log, so checks can assert exact sequences.
namespace System.Windows.Forms
{
    // Same member names as the WinForms enum; this project does not reference WinForms.
    internal enum FormWindowState { Normal = 0, Minimized = 1, Maximized = 2 }
}
namespace Microsoft.Web.WebView2.Core
{
    // Same names and values as the WebView2 SDK enum.
    internal enum CoreWebView2MemoryUsageTargetLevel { Normal = 0, Low = 1 }
}
namespace FoliaLyrics
{
    internal static class DataFiles
    {
        public static readonly List<Exception> Logged = [];
        public static void Log(Exception error) => Logged.Add(error);
    }

    internal sealed class FakeTimer(List<string> events)
    {
        private bool enabled;
        public bool Enabled { get => enabled; set { enabled = value; events.Add(value ? "timer=on" : "timer=off"); } }
    }

    internal sealed class FakeCore(List<string> events)
    {
        public bool ThrowOnMemoryTarget;
        private Microsoft.Web.WebView2.Core.CoreWebView2MemoryUsageTargetLevel level;
        public Microsoft.Web.WebView2.Core.CoreWebView2MemoryUsageTargetLevel MemoryUsageTargetLevel
        {
            get => level;
            set
            {
                if (ThrowOnMemoryTarget) throw new NotSupportedException("this WebView2 runtime has no memory target");
                level = value; events.Add("memory=" + value);
            }
        }
    }

    internal sealed class FakeWeb(List<string> events)
    {
        public bool IsDisposed;
        public bool ThrowOnVisible;
        // Null until the real control has finished initialising, as with WebView2.CoreWebView2.
        public FakeCore CoreWebView2 { get; set; } = null!;
        private bool visible = true;
        public bool Visible
        {
            get => visible;
            set
            {
                if (ThrowOnVisible) throw new InvalidOperationException("the browser process is gone");
                visible = value; events.Add("web.Visible=" + (value ? "true" : "false"));
            }
        }
    }

    // The members WindowBackgroundState.cs expects from the real MainWindow, plus test-only controls.
    internal sealed partial class MainWindow
    {
        public readonly List<string> Events = [];
        private readonly CancellationTokenSource lifetime = new();
        private readonly Preferences preferences = new();
        private readonly FakeTimer audioTimer;
        private readonly FakeWeb web;
        private bool ready;
        public bool IsDisposed { get; set; }
        public bool Disposing { get; set; }
        public FormWindowState WindowState { get; set; } = FormWindowState.Normal;

        public MainWindow(bool coreAvailable = true)
        {
            audioTimer = new FakeTimer(Events);
            web = new FakeWeb(Events);
            if (coreAvailable) web.CoreWebView2 = new FakeCore(Events);
        }

        private void FocusLyricsIfActive() => Events.Add("focus");

        // Test controls. They call the production methods exactly as WndProc, the page's ready command and the sound-response command do.
        public FakeWeb Web => web;
        public FakeTimer Timer => audioTimer;
        public bool AudioReactive { get => preferences.AudioReactive; set => preferences.AudioReactive = value; }
        public bool PageIsReady => ready;
        public bool WebWasHidden => webHidden;
        public void AttachCore() => web.CoreWebView2 = new FakeCore(Events);
        public void SizeMessage(long sizeType)
        {
            // WM_SIZE changes WindowState before the handler runs, so the stand-in tracks it the same way.
            if (WindowBackgroundPolicy.MinimizedFrom(sizeType) is { } minimized) WindowState = minimized ? FormWindowState.Minimized : FormWindowState.Normal;
            OnSizeMessage(sizeType);
        }
        public void PageReady() { ready = true; ApplyBackgroundStateForCurrentWindow(); }
        public void SoundResponse(bool on) { preferences.AudioReactive = on; ApplyBackgroundStateForCurrentWindow(); }
        public void Shutdown() => lifetime.Cancel();
        public IReadOnlyList<string> Take()
        {
            var taken = Events.ToArray(); Events.Clear(); return taken;
        }
    }
}
