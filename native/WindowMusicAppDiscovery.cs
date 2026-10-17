// native/WindowMusicAppDiscovery.cs — background discovery queues candidates without modifying bindings or taking focus.
namespace FoliaLyrics;
internal sealed partial class MainWindow
{
    private readonly System.Windows.Forms.Timer musicAppDiscoveryTimer = new() { Interval = 10000 };
    private readonly MusicAppDiscoveryInbox musicAppInbox = new();
    private bool musicAppDiscoveryInitialized, musicAppDiscoveryBusy, musicAppInstalledScanCompleted, musicAppExplicitScanPending, musicAppExplicitScanNotifyPending;
    private bool musicAppBoundIconsRefreshed;
    private int musicAppDiscoveryRevision;

    private void StartMusicAppDiscovery()
    {
        if (!musicAppDiscoveryInitialized)
        {
            musicAppDiscoveryInitialized = true;
            musicAppDiscoveryTimer.Tick += async (_, _) => await DiscoverMusicApps(installed: !musicAppInstalledScanCompleted, notify: false);
            FormClosed += (_, _) => musicAppDiscoveryTimer.Dispose();
        }
        if (!musicAppBoundIconsRefreshed)
        {
            musicAppBoundIconsRefreshed = true;
            _ = RefreshBoundStoreIcons();
        }
        if (!preferences.AutoDiscoverMusicApps) { musicAppDiscoveryTimer.Stop(); return; }
        musicAppDiscoveryTimer.Start();
        if (!musicAppInstalledScanCompleted) _ = DiscoverMusicApps(installed: true, notify: false);
    }

    // Refresh only saved Store artwork once per host run, without scanning or launching any player.
    private async Task RefreshBoundStoreIcons()
    {
        var bound = preferences.MusicApps.Where(app => app.LaunchKind == "store"
            && MusicAppDiscoveryPolicy.ValidAppUserModelId(app.AppUserModelId)).ToArray();
        if (bound.Length == 0) return;
        try
        {
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
            deadline.CancelAfter(TimeSpan.FromSeconds(10));
            var refreshed = await Task.Run(async () =>
            {
                var icons = new Dictionary<int, MusicAppBinding>();
                foreach (var app in bound)
                {
                    deadline.Token.ThrowIfCancellationRequested();
                    try
                    {
                        if (await MusicAppStore.ReadBindingAsync(app.AppUserModelId, deadline.Token) is { Icon.Length: > 0 } current)
                            icons.Add(app.Slot, current);
                    }
                    catch (Exception error) when (error is not OperationCanceledException) { }
                }
                return icons;
            }, deadline.Token);
            if (IsDisposed || Disposing || lifetime.IsCancellationRequested) return;
            var updated = MusicAppLauncher.ApplyRefreshedStoreIcons(preferences.MusicApps, refreshed);
            if (!ReferenceEquals(updated, preferences.MusicApps))
            {
                preferences.MusicApps = updated;
                SavePreferences();
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception error) { DataFiles.Log(error); }
    }

    // Snapshot bound/blocked identities before background IO, then reject results invalidated by a user action.
    private async Task DiscoverMusicApps(bool installed, bool notify, bool notifyResult = true)
    {
        if (musicAppDiscoveryBusy)
        {
            if (notify) { musicAppExplicitScanPending = true; musicAppExplicitScanNotifyPending |= notifyResult; }
            return;
        }
        if (!ready || choosingMusicApp || IsDisposed || Disposing
            || lifetime.IsCancellationRequested || !notify && !preferences.AutoDiscoverMusicApps) return;
        musicAppDiscoveryBusy = true;
        SendMusicAppDiscovery();
        var revision = musicAppDiscoveryRevision;
        var ignored = preferences.MusicApps.Select(MusicAppDiscoveryPolicy.Id).Concat(preferences.BlockedMusicApps.Select(app => app.Id))
            .Concat(notify ? [] : musicAppInbox.KnownIds).ToArray();
        try
        {
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
            deadline.CancelAfter(TimeSpan.FromSeconds(15));
            var scan = await Task.Run(() => MusicAppDiscovery.ScanAsync(installed, ignored, deadline.Token), deadline.Token);
            if (IsDisposed || Disposing || lifetime.IsCancellationRequested || revision != musicAppDiscoveryRevision || choosingMusicApp) return;
            musicAppInbox.Update(scan, preferences.MusicApps, preferences.BlockedMusicApps, manual: notify);
            if (installed) musicAppInstalledScanCompleted = true;
            if (notify && notifyResult && musicAppInbox.Candidates.Length == 0)
                Send("notice", new { text = "没有发现新的音乐软件，可手动选择 .exe 文件绑定。", target = new { id = "music-app-add" } });
        }
        catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { }
        catch (Exception error)
        {
            DataFiles.Log(error);
            if (notify && notifyResult && !IsDisposed && !Disposing) Send("notice", new { text = "扫描音乐软件失败，可手动绑定。", target = new { id = "music-app-add" } });
        }
        finally
        {
            musicAppDiscoveryBusy = false;
            SendMusicAppDiscovery();
            if (musicAppExplicitScanPending && !IsDisposed && !Disposing && !lifetime.IsCancellationRequested)
            {
                var queuedNotice = musicAppExplicitScanNotifyPending;
                musicAppExplicitScanPending = false; musicAppExplicitScanNotifyPending = false;
                await DiscoverMusicApps(installed: true, notify: true, notifyResult: queuedNotice);
            }
        }
    }

    private void SendMusicAppDiscovery()
    {
        if (ready && !IsDisposed && !Disposing && !lifetime.IsCancellationRequested)
            Send("musicAppDiscovery", new { batchId = musicAppInbox.BatchId, busy = musicAppDiscoveryBusy, candidates = musicAppInbox.Candidates });
    }

    private void SetMusicAppDiscovery(bool enabled)
    {
        musicAppDiscoveryRevision++;
        preferences.AutoDiscoverMusicApps = enabled;
        SavePreferences();
        StartMusicAppDiscovery();
    }
}
