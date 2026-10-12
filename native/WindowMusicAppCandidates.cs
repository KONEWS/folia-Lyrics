using System.Text.Json;

// native/WindowMusicAppCandidates.cs — apply only host-owned candidates and keep explicit blocks separate from removal.
namespace FoliaLyrics;
internal sealed partial class MainWindow
{
    private void ConfirmMusicApps(JsonElement value)
    {
        var candidates = musicAppInbox.Resolve(value, multiple: true);
        musicAppDiscoveryRevision++;
        var previous = preferences.MusicApps.Length;
        preferences.MusicApps = MusicAppDiscoveryPolicy.Merge(preferences.MusicApps,
            candidates.Select(app => MusicAppDiscoveryPolicy.Binding(app)), preferences.BlockedMusicApps.Select(app => app.Id));
        musicAppInbox.Reconcile(preferences.MusicApps, preferences.BlockedMusicApps);
        SavePreferences();
        SendMusicAppDiscovery();
        var added = preferences.MusicApps.Length - previous;
        if (added > 0) Send("notice", new { text = $"已添加 {added} 个音乐软件，可从首页打开。", target = new { id = "music-apps" } });
    }

    private void DismissMusicAppDiscovery(JsonElement value)
    {
        musicAppInbox.Dismiss(value);
        // A scan in progress must not restore the batch that the user just deferred.
        musicAppDiscoveryRevision++;
        SendMusicAppDiscovery();
    }

    private void BlockMusicApp(JsonElement value)
    {
        MusicAppCandidate candidate;
        if (value.ValueKind == JsonValueKind.Object && value.TryGetProperty("slot", out var slotValue))
        {
            if (slotValue.ValueKind != JsonValueKind.Number || !slotValue.TryGetInt32(out var slot) || slot is < 0 or int.MaxValue)
                throw new IOException("请选择有效的音乐软件快捷位。");
            candidate = MusicAppDiscoveryPolicy.Candidate(MusicAppLauncher.Resolve(preferences.MusicApps, slot));
        }
        else candidate = musicAppInbox.Resolve(value, multiple: false).Single();
        musicAppDiscoveryRevision++;
        preferences.BlockedMusicApps = MusicAppDiscoveryPolicy.NormalizeBlocked(preferences.BlockedMusicApps.Append(candidate));
        musicAppInbox.Reconcile(preferences.MusicApps, preferences.BlockedMusicApps);
        SavePreferences();
        SendMusicAppDiscovery();
        Send("notice", new { text = $"已屏蔽 {candidate.Name} 的发现提示，可在设置中恢复。", target = new { id = "music-apps" } });
    }

    private async Task UnblockMusicApp(JsonElement value)
    {
        var id = MusicAppDiscoveryInbox.ReadId(value.ValueKind == JsonValueKind.Object && value.TryGetProperty("id", out var property) ? property : default);
        if (!preferences.BlockedMusicApps.Any(app => app.Id == id)) throw new IOException("找不到要恢复的音乐软件。");
        musicAppDiscoveryRevision++;
        preferences.BlockedMusicApps = preferences.BlockedMusicApps.Where(app => app.Id != id).ToArray();
        SavePreferences();
        await DiscoverMusicApps(installed: true, notify: true);
    }
}
