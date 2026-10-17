// native/WindowMusicAppLaunch.cs — asynchronous player launch and its short foreground protection share one request lifetime.
namespace FoliaLyrics;
internal sealed partial class MainWindow
{
    private readonly Dictionary<int, MusicAppLaunchState> musicAppLaunches = new();
    private sealed record MusicAppLaunchState(long StartedAt, WindowForegroundProtection.Request Foreground, string BindingKey)
    {
        public bool Active { get; set; } = true;
        public bool Succeeded { get; set; }
        public long SourceIntent { get; set; }
    }

    // Launch only the saved slot binding; repeated clicks renew protection without starting duplicate processes.
    private async Task LaunchMusicApp(int slot)
    {
        if (IsDisposed || Disposing || lifetime.IsCancellationRequested) return;
        var now = Environment.TickCount64;
        var binding = MusicAppLauncher.Resolve(preferences.MusicApps, slot);
        var bindingKey = MusicAppDiscoveryPolicy.Key(binding);
        var intent = ++sourceIntent;
        if (musicAppLaunches.TryGetValue(slot, out var recent)
            && string.Equals(recent.BindingKey, bindingKey, StringComparison.OrdinalIgnoreCase)
            && (recent.Active || now - recent.StartedAt < 1500))
        {
            recent.SourceIntent = intent;
            RenewMusicAppForeground(recent.Foreground);
            if (recent.Succeeded) await FollowLaunchedMusicApp(slot, binding, recent);
            return;
        }
        var launch = new MusicAppLaunchState(now, BeginMusicAppForeground(), bindingKey) { SourceIntent = intent };
        musicAppLaunches[slot] = launch;
        try
        {
            await Task.Run(() => MusicAppLauncher.LaunchAsync(binding, lifetime.Token), lifetime.Token);
            launch.Succeeded = true;
            if (!IsDisposed && !Disposing)
            {
                RenewMusicAppForeground(launch.Foreground);
                await FollowLaunchedMusicApp(slot, binding, launch);
                if (!IsDisposed && !Disposing && !lifetime.IsCancellationRequested)
                    Send("notice", new { text = $"已请求打开 {binding.Name}，请在播放器中播放歌曲。", target = new { id = "player-source" } });
            }
        }
        catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { CancelMusicAppForeground(launch.Foreground); }
        catch (Exception error)
        {
            CancelMusicAppForeground(launch.Foreground);
            if (musicAppLaunches.TryGetValue(slot, out var currentLaunch) && ReferenceEquals(launch, currentLaunch)) musicAppLaunches.Remove(slot);
            DataFiles.Log(error);
            if (!IsDisposed && !Disposing) Send("notice", new { text = $"无法打开 {binding.Name}：{error.Message}", target = new { id = "music-app-binding", slot } });
        }
        finally { launch.Active = false; }
    }

    // A late shell completion cannot override a newer player choice or a removed/replaced shortcut.
    private Task FollowLaunchedMusicApp(int slot, MusicAppBinding binding, MusicAppLaunchState launch)
    {
        if (IsDisposed || Disposing || lifetime.IsCancellationRequested || launch.SourceIntent != sourceIntent
            || !musicAppLaunches.TryGetValue(slot, out var currentLaunch) || !ReferenceEquals(launch, currentLaunch)
            || !preferences.MusicApps.Any(app => app.Slot == slot
                && string.Equals(MusicAppDiscoveryPolicy.Key(app), launch.BindingKey, StringComparison.OrdinalIgnoreCase)))
            return Task.CompletedTask;
        return ChangeMediaSource(binding.LaunchKind == "store" ? binding.AppUserModelId : binding.Path);
    }
}
