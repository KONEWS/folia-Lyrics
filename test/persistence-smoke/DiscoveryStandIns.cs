using System.Text.Json;

// test/persistence-smoke/DiscoveryStandIns.cs — isolate installation scans and timers while running production restore/discovery routing.
namespace System.Windows.Forms
{
    internal sealed class Timer : IDisposable
    {
        public int Interval { get; set; }
        public event EventHandler? Tick { add { } remove { } }
        public void Start() { }
        public void Stop() { }
        public void Dispose() { }
    }
}
namespace FoliaLyrics
{
    internal sealed record MusicAppScan(MusicAppBinding[] Candidates, IReadOnlyDictionary<string, string> RunningInstances);
    internal static class MusicAppDiscovery
    {
        internal static Func<bool, string[], CancellationToken, Task<MusicAppScan>> Scan = (_, _, _) => throw new InvalidOperationException("No fixture scan configured.");
        internal static Task<MusicAppScan> ScanAsync(bool installed, IEnumerable<string> ignoredIds, CancellationToken token)
            => Scan(installed, ignoredIds.ToArray(), token);
    }
    // Restore never launches/binds an application; fail loudly if this test unexpectedly enters those unrelated paths.
    internal static class MusicAppLauncher
    {
        internal static MusicAppBinding[] NormalizeBindings(IEnumerable<MusicAppBinding?>? bindings) => throw new InvalidOperationException("Unexpected binding normalization.");
        internal static int NextSlot(IEnumerable<MusicAppBinding?>? bindings) => throw new InvalidOperationException("Unexpected slot allocation.");
        internal static MusicAppBinding Resolve(IEnumerable<MusicAppBinding> bindings, int slot) => throw new InvalidOperationException("Unexpected binding lookup.");
        internal static MusicAppBinding[] ApplyRefreshedStoreIcons(MusicAppBinding[] bindings, IReadOnlyDictionary<int, MusicAppBinding> refreshed)
            => throw new InvalidOperationException("Unexpected Store icon refresh.");
    }
    internal static class MusicAppStore
    {
        internal static Task<MusicAppBinding?> ReadBindingAsync(string appUserModelId, CancellationToken token)
            => throw new InvalidOperationException("Unexpected Store binding lookup.");
    }
    internal sealed partial class MainWindow
    {
        private readonly CancellationTokenSource lifetime = new();
        private readonly bool ready = true, choosingMusicApp = false;
        public bool IsDisposed => false;
        public bool Disposing => false;
        public event EventHandler? FormClosed { add { } remove { } }
        public void ConfigureDiscovery(MusicAppCandidate blocked) { preferences.AutoDiscoverMusicApps = false; preferences.BlockedMusicApps = [blocked]; }
        public Task RestoreDiscovery(string id) => UnblockMusicApp(JsonSerializer.SerializeToElement(new { id }));
        public Task ScanApps(bool manual, bool notifyResult = true) => DiscoverMusicApps(installed: true, notify: manual, notifyResult: notifyResult);
        public MusicAppCandidate[] DiscoveredApps => musicAppInbox.Candidates;
    }
}
