using System.Reflection;
using FoliaLyrics;

// test/lyric-performance/OnlineChoicePersistenceChecks.cs — real file locks distinguish an unsaved choice from harmless post-commit cleanup failures.
internal static class OnlineChoicePersistenceChecks
{
    private static readonly TimeSpan Limit = TimeSpan.FromSeconds(6);
    private static Song SongOf(string title) => new(title, title, "Artist", "", "", false, 0, 180, 1, true, [], "Album");
    private static Lyrics Packet(Song song, string text) => new(song.Key, song.Title, song.Artist, "[00:01.00]" + text, "persistence test", "", false, "lrc");
    private static OnlineCache Cache(MainWindow host) => (OnlineCache)typeof(MainWindow).GetField("onlineCache", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(host)!;
    private static string FileName(OnlineCache cache, Song song) => (string)typeof(OnlineCache).GetMethod("FileName", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(cache, [song])!;
    private static string Binding(OnlineCache cache, Song song) => Path.Combine(Path.GetDirectoryName(FileName(cache, song))!, "bindings", Path.GetFileName(FileName(cache, song)));
    private static void Providers()
    {
        TestProviders.SearchHandler = (query, sources, _) => Task.FromResult(new OnlineSearchResult(sources.Select(source =>
            new LyricCandidate(source, "new", query.Title, query.Artist, query.Album, query.Duration, "timed")).ToArray(), []));
        TestProviders.FetchHandler = (candidate, target, _) => Task.FromResult<Lyrics?>(Packet(target, candidate.Key));
    }

    public static async Task Run(Action<bool, string> check)
    {
        await LockedChoiceKeepsOldDiskRecord(check);
        await ChoiceSurvivesSongChangesAndReplacement(check);
        await CleanupFailureDoesNotUndoCommit(check);
        SessionChoiceSaveOrdering(check);
    }

    private static async Task LockedChoiceKeepsOldDiskRecord(Action<bool, string> check)
    {
        DataFiles.Reset(); var song = SongOf("Online cache locked replacement");
        var root = Path.Combine(DataFiles.Root, "locked-online-cache"); var cache = new OnlineCache(root);
        await cache.SaveAsync(song, Packet(song, "old disk choice"), "qq:old", true);
        using var locked = new FileStream(Binding(cache, song), FileMode.Open, FileAccess.Read, FileShare.Read);
        var result = await cache.SaveAsync(song, Packet(song, "new unsaved choice"), "qq:new", true);
        check(!result.Saved && result.MaintenanceErrors.Length == 0 && await cache.ReadAsync(song) is { CandidateKey: "qq:old" },
            "a real locked binding reports replacement failure and retains the previous valid record");
        check(!Directory.EnumerateFiles(root, "*.tmp", SearchOption.AllDirectories).Any(),
            "a failed atomic online replacement removes its temporary file");
    }

    // Exercise the complete host path, including failed persistence, a different song, an import and a newer online selection.
    private static async Task ChoiceSurvivesSongChangesAndReplacement(Action<bool, string> check)
    {
        DataFiles.Reset(); Providers(); var song = SongOf("Unremembered online choice"); var next = SongOf("Other cached choice");
        using var host = new MainWindow(); var cache = Cache(host);
        await cache.SaveAsync(song, Packet(song, "old persistent choice"), "qq:old", true);
        await cache.SaveAsync(next, Packet(next, "other song"), "qq:other", true);
        await host.Resolve(song); await host.Search(song.Title, song.Artist);
        using (var locked = new FileStream(Binding(cache, song), FileMode.Open, FileAccess.Read, FileShare.Read))
        {
            await host.Select("qq:new", song.Key).WaitAsync(Limit);
            check(host.Status.Phase == "ready" && !host.Status.Busy && host.Status.Message.Contains("未记住")
                && host.Packets.Last().Content.Contains("qq:new") && host.Notices.Last().Text("text").Contains("未记住"),
                "a usable manual lyric remains displayed while the host explicitly reports that its locked binding was not remembered");
            await host.Resolve(next); await host.Resolve(song with { Key = song.Key + " changed session" });
            check(host.Status.SelectedKey == "qq:new" && host.Packets.Last().Content.Contains("qq:new")
                && host.Packets.Last().Key == song.Key + " changed session" && await cache.ReadAsync(song) is { CandidateKey: "qq:old" },
                "an unremembered manual choice survives switching songs and a new playback identity without replacing the old disk binding");
            using (var restart = new MainWindow())
            {
                await restart.Resolve(song);
                check(restart.Packets.Single().Content.Contains("old persistent choice"),
                    "a fresh host recovers the older durable choice instead of inheriting another session's unsaved lyrics");
            }
            var path = Path.Combine(DataFiles.Root, "replace-unsaved-online.lrc"); File.WriteAllText(path, "[00:01.00]latest local import");
            DataFiles.SaveFails = true; await host.Import(path);
            await host.Resolve(next); await host.Resolve(song);
            check(host.Packets.Last().Content.Contains("latest local import"),
                "a later valid local import replaces an unremembered online choice for the current session");
        }
        DataFiles.SaveFails = false;
        await host.Search(song.Title, song.Artist); await host.Select("netease:new", song.Key);
        await host.Resolve(next); await host.Resolve(song);
        check(host.Status.SelectedKey == "netease:new" && !host.Status.Message.Contains("未记住") && host.Packets.Last().Content.Contains("netease:new")
            && await cache.ReadAsync(song) is { CandidateKey: "netease:new", Manual: true },
            "a later successful explicit online choice replaces the temporary import and old durable binding and survives returning to the song");
    }

    private static async Task CleanupFailureDoesNotUndoCommit(Action<bool, string> check)
    {
        DataFiles.Reset(); Providers(); var song = SongOf("Online cleanup after commit");
        using var host = new MainWindow(); var cache = Cache(host);
        await cache.SaveAsync(song, Packet(song, "old automatic download"), "qq:automatic", false, OnlineLyrics.PriorityPolicyVersion);
        await host.Resolve(song); await host.Search(song.Title, song.Artist);
        using var locked = new FileStream(FileName(cache, song), FileMode.Open, FileAccess.Read, FileShare.Read);
        var result = await cache.SaveAsync(song, Packet(song, "first durable choice"), "qq:first", true);
        check(result.Saved && result.MaintenanceErrors.Length > 0 && await cache.ReadAsync(song) is { CandidateKey: "qq:first" },
            "a locked obsolete download is reported as maintenance failure after the new binding successfully commits");
        await host.Select("netease:new", song.Key).WaitAsync(Limit);
        check(host.Status.Phase == "ready" && !host.Status.Message.Contains("未记住") && host.Notices.IsEmpty
            && await cache.ReadAsync(song) is { CandidateKey: "netease:new" },
            "post-commit cleanup failure cannot produce a false unsaved warning for a remembered manual choice");
    }

    private static void SessionChoiceSaveOrdering(Action<bool, string> check)
    {
        var choices = new OnlineSessionChoices(); var song = SongOf("Late online persistence");
        var old = choices.Remember(song, Packet(song, "old"), "qq:old");
        var next = choices.Remember(song, Packet(song, "new"), "qq:new");
        choices.CompleteSave(song, old, true); choices.CompleteSave(song, next, false);
        check(choices.Read(song) is { CandidateKey: "qq:new", Failed: true },
            "an older completed save cannot discard a newer unremembered session choice");
        choices.Clear(song); choices.CompleteSave(song, next, false);
        check(choices.Read(song) is null, "a late failed save cannot resurrect a session choice replaced by an import or reset");
    }
}
