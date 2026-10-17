// test/launch-foreground-smoke/StandIns.cs — no real window, player, timer thread or user preferences.
namespace System.Windows.Forms
{
    internal enum FormWindowState { Normal, Minimized, Maximized }
    internal sealed class Timer : IDisposable
    {
        public int Interval { get; set; }
        public bool Enabled { get; private set; }
        public bool IsDisposed { get; private set; }
        public event EventHandler? Tick;
        public void Start() { if (IsDisposed) throw new ObjectDisposedException(nameof(Timer)); Enabled = true; }
        public void Stop() { if (IsDisposed) throw new ObjectDisposedException(nameof(Timer)); Enabled = false; }
        public void Fire() { if (Enabled) Tick?.Invoke(this, EventArgs.Empty); }
        public void Dispose() { IsDisposed = true; Enabled = false; }
    }
}
namespace FoliaLyrics
{
    internal sealed record MusicAppBinding(int Slot, string Name, string Path, string Icon = "", string LaunchKind = "exe", string AppUserModelId = "");
    internal sealed class Preferences
    {
        public bool Topmost;
        public string Source = "";
        public MusicAppBinding[] MusicApps = [new(0, "test player A", @"C:\Players\A.exe"), new(1, "test player B", @"C:\Players\B.exe")];
    }
    internal static class MusicAppDiscoveryPolicy
    {
        public static string Key(MusicAppBinding binding) => binding.LaunchKind == "store"
            ? "store:" + binding.AppUserModelId : "exe:" + Path.GetFullPath(binding.Path).Replace('/', '\\');
    }
    internal static class MusicAppLauncher
    {
        public static Func<MusicAppBinding, CancellationToken, Task> Launch = (_, _) => Task.CompletedTask;
        public static MusicAppBinding Resolve(IEnumerable<MusicAppBinding> bindings, int slot) => bindings.Single(app => app.Slot == slot);
        public static Task LaunchAsync(MusicAppBinding binding, CancellationToken token) => Launch(binding, token);
    }
    internal static class DataFiles { public static void Log(Exception error) { } }
    internal sealed partial class MainWindow : IDisposable
    {
        private readonly Preferences preferences = new();
        private readonly CancellationTokenSource lifetime = new();
        private long sourceIntent;
        public long Now;
        public bool IsDisposed, TopMost;
        public bool Disposing { get; set; }
        public bool Visible = true;
        public FormWindowState WindowState;
        public int Saves, Activations, Fronts, Focuses;
        public readonly List<(string Type, object Data)> Messages = [];
        public readonly List<string> SourceChanges = [];
        public event EventHandler? Disposed;
        public MainWindow(bool pinned = false)
        {
            launchForeground = new(() => Now);
            TopMost = preferences.Topmost = pinned;
            InitializeLaunchForeground();
        }
        public WindowForegroundProtection.Request Begin() => BeginMusicAppForeground();
        public Task Launch(int slot) => LaunchMusicApp(slot);
        public string Source => preferences.Source;
        public long SourceIntent => sourceIntent;
        public MusicAppBinding Binding(int slot) => MusicAppLauncher.Resolve(preferences.MusicApps, slot);
        public void SetBindings(params MusicAppBinding[] bindings) => preferences.MusicApps = bindings;
        public Task SelectSource(string source) => ChangeMediaSource(source);
        // The transport smoke compiles the real source handover; this bridge records launch ordering without native media.
        private Task ChangeMediaSource(string source)
        {
            sourceIntent++;
            if (!string.Equals(preferences.Source, source, StringComparison.OrdinalIgnoreCase))
            { preferences.Source = source; SourceChanges.Add(source); }
            return Task.CompletedTask;
        }
        public void Renew(WindowForegroundProtection.Request request) => RenewMusicAppForeground(request);
        public void Cancel(WindowForegroundProtection.Request request) => CancelMusicAppForeground(request);
        public void Pin(bool value) => SetTopmostPreference(value);
        public void Elapse(int milliseconds) { Now += milliseconds; launchForegroundTimer.Fire(); }
        public bool Pinned => preferences.Topmost;
        public bool TimerRunning => launchForegroundTimer.Enabled;
        public bool TimerDisposed => launchForegroundTimer.IsDisposed;
        public int Remaining => launchForeground.RemainingMilliseconds();
        private void Show() => Visible = true;
        private void BringToFront() => Fronts++;
        private void Activate() => Activations++;
        private void FocusLyricsIfActive() => Focuses++;
        private void SavePreferences() => Saves++;
        private void Send(string type, object data) => Messages.Add((type, data));
        public void Dispose() { if (IsDisposed) return; IsDisposed = true; lifetime.Cancel(); Disposed?.Invoke(this, EventArgs.Empty); }
    }
}
