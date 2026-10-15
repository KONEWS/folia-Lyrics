// native/WindowMusicApps.cs — native file selection and slot-based music application shortcuts.
namespace FoliaLyrics;
internal sealed partial class MainWindow
{
    private bool choosingMusicApp;
    private readonly Dictionary<int, object> musicAppChoices = new();
    private readonly Dictionary<int, MusicAppLaunchState> musicAppLaunches = new();
    private sealed record MusicAppLaunchState(long StartedAt)
    {
        public bool Active { get; set; } = true;
    }

    private void NormalizeMusicApps()
    {
        preferences.MusicApps = MusicAppLauncher.NormalizeBindings(preferences.MusicApps);
        preferences.BlockedMusicApps = MusicAppDiscoveryPolicy.NormalizeBlocked(preferences.BlockedMusicApps);
    }

    // Keep the owned picker on the UI thread, then extract file metadata without delaying media polling.
    private async Task ChooseMusicApp(int? existingSlot)
    {
        if (choosingMusicApp) return;
        if (existingSlot is int existing) MusicAppLauncher.Resolve(preferences.MusicApps, existing);
        var slot = existingSlot ?? MusicAppLauncher.NextSlot(preferences.MusicApps);
        choosingMusicApp = true;
        musicAppDiscoveryRevision++;
        var choice = new object();
        musicAppChoices[slot] = choice;
        try
        {
            using var dialog = new OpenFileDialog
            {
                Title = existingSlot.HasValue ? "更换音乐软件" : "添加音乐软件", Filter = "音乐软件 (*.exe)|*.exe",
                CheckFileExists = true, CheckPathExists = true, Multiselect = false, RestoreDirectory = true,
            };
            if (dialog.ShowDialog(this) != DialogResult.OK) return;
            var selectedPath = dialog.FileName;
            var binding = await Task.Run(() => MusicAppLauncher.ReadBinding(slot, selectedPath), lifetime.Token);
            if (IsDisposed || Disposing || lifetime.IsCancellationRequested
                || !musicAppChoices.TryGetValue(slot, out var currentChoice) || !ReferenceEquals(choice, currentChoice)) return;
            NormalizeMusicApps();
            // A removed replacement must not reappear, and a new choice must not overwrite an occupied identity.
            if (existingSlot.HasValue != preferences.MusicApps.Any(app => app.Slot == slot)) return;
            if (existingSlot.HasValue) musicAppInbox.DeferBinding(MusicAppLauncher.Resolve(preferences.MusicApps, slot));
            preferences.MusicApps = preferences.MusicApps.Where(app => app.Slot != slot).Append(binding).OrderBy(app => app.Slot).ToArray();
            preferences.BlockedMusicApps = preferences.BlockedMusicApps.Where(app => app.Id != MusicAppDiscoveryPolicy.Id(binding)).ToArray();
            musicAppInbox.Reconcile(preferences.MusicApps, preferences.BlockedMusicApps);
            musicAppLaunches.Remove(slot);
            var saved = SavePreferences();
            SendMusicAppDiscovery();
            if (saved) Send("notice", new { text = $"已绑定 {binding.Name}，可从首页打开。", target = new { id = "music-app-binding", slot } });
        }
        catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { }
        catch (Exception error)
        {
            DataFiles.Log(error);
            Send("notice", new { text = "绑定音乐软件失败：" + error.Message, target = existingSlot.HasValue
                ? (object)new { id = "music-app-binding", slot } : new { id = "music-app-add" } });
        }
        finally
        {
            if (musicAppChoices.TryGetValue(slot, out var currentChoice) && ReferenceEquals(choice, currentChoice)) musicAppChoices.Remove(slot);
            choosingMusicApp = false;
        }
    }

    private void RemoveMusicApp(int slot)
    {
        var binding = MusicAppLauncher.Resolve(preferences.MusicApps, slot);
        musicAppDiscoveryRevision++;
        musicAppChoices.Remove(slot);
        musicAppLaunches.Remove(slot);
        NormalizeMusicApps();
        musicAppInbox.DeferBinding(binding);
        preferences.MusicApps = preferences.MusicApps.Where(app => app.Slot != slot).ToArray();
        var saved = SavePreferences();
        SendMusicAppDiscovery();
        if (saved) Send("notice", new { text = $"已移除 {binding.Name} 的快捷方式。", target = new { id = "music-app-add" } });
    }

    // Launch only the saved slot binding, with a short guard against accidental repeated clicks.
    private async Task LaunchMusicApp(int slot)
    {
        var now = Environment.TickCount64;
        var binding = MusicAppLauncher.Resolve(preferences.MusicApps, slot);
        if (musicAppLaunches.TryGetValue(slot, out var recent) && (recent.Active || now - recent.StartedAt < 1500)) return;
        var launch = new MusicAppLaunchState(now);
        musicAppLaunches[slot] = launch;
        try
        {
            await Task.Run(() => MusicAppLauncher.LaunchAsync(binding, lifetime.Token), lifetime.Token);
            if (!IsDisposed && !Disposing) Send("notice", new { text = $"已请求打开 {binding.Name}，请在播放器中播放歌曲。", target = new { id = "player-source" } });
        }
        catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { }
        catch (Exception error)
        {
            if (musicAppLaunches.TryGetValue(slot, out var currentLaunch) && ReferenceEquals(launch, currentLaunch)) musicAppLaunches.Remove(slot);
            DataFiles.Log(error);
            Send("notice", new { text = $"无法打开 {binding.Name}：{error.Message}", target = new { id = "music-app-binding", slot } });
        }
        finally { launch.Active = false; }
    }
}
