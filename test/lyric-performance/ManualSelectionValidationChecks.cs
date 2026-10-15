using FoliaLyrics;
using System.Reflection;

// test/lyric-performance/ManualSelectionValidationChecks.cs — manual choices use the real inspection registry before changing lyrics or persistent bindings.
internal static class ManualSelectionValidationChecks
{
    private static readonly TimeSpan Limit = TimeSpan.FromSeconds(8);
    private static Song SongOf(string name) => new(name, name, "Artist", "", "", false, 0, 180, 1, true, [], "Album");
    private static OnlineCache Cache() => new(Path.Combine(DataFiles.Root, "online-lyrics"));
    private static Lyrics Packet(Song song, string text) => new(song.Key, song.Title, song.Artist, "[00:01.00]" + text, "manual test", "", false, "lrc");
    private static void Candidates() => TestProviders.SearchHandler = (query, sources, _) => Task.FromResult(new OnlineSearchResult(
        sources.Select(source => new LyricCandidate(source, "new", query.Title, query.Artist, query.Album, query.Duration, "timed")).ToArray(), []));

    public static async Task Run(Action<bool, string> check)
    {
        await InvalidChoiceKeepsPrevious(check);
        await InspectionTimeoutKeepsPrevious(check);
        await SongChangeCancelsManualInspection(check);
        await NewChoiceCancelsManualInspection(check);
        await UnsavedImportKeepsPreviousBinding(check);
        await SongChangeDuringUnsavedImport(check);
    }

    private static async Task InvalidChoiceKeepsPrevious(Action<bool, string> check)
    {
        DataFiles.Reset(); var song = SongOf("Invalid manual QRC"); var cache = Cache();
        await cache.SaveAsync(song, Packet(song, "previous"), "qq:previous", true); Candidates();
        TestProviders.FetchHandler = (_, target, _) => Task.FromResult<Lyrics?>(new(target.Key, target.Title, target.Artist, new string('a', 32), "bad QRC", "", false, "qq-qrc"));
        var inspections = 0;
        TestProviders.InspectionHandler = packet => { inspections++; return Task.FromResult(new LyricContentQuality(packet.Format != "qq-qrc", false)); };
        using var host = new MainWindow(); await host.Resolve(song); await host.Search(song.Title, song.Artist); await host.Select("qq:new", song.Key);
        check(inspections == 1 && host.Status.Phase == "failed" && !host.Status.Busy && host.Packets.Single().Content.Contains("previous"),
            "a hex-shaped but unparsable manual QRC is inspected and cannot replace visible lyrics");
        check(await cache.ReadAsync(song) is { Manual: true, CandidateKey: "qq:previous" },
            "a rejected manual packet cannot overwrite the previous persistent choice");
        TestProviders.FetchHandler = (_, target, _) => Task.FromResult<Lyrics?>(Packet(target, "validated line"));
        await host.Select("qq:new", song.Key);
        check(inspections == 2 && host.Status.Phase == "ready" && host.Packets.Count == 2 && host.Packets.Last().Content.Contains("validated line")
            && await cache.ReadAsync(song) is { Manual: true, CandidateKey: "qq:new" },
            "a usable manual line lyric is applied and saved after inspection without requiring word timing");
    }

    private static async Task InspectionTimeoutKeepsPrevious(Action<bool, string> check)
    {
        DataFiles.Reset(); var song = SongOf("Manual inspection timeout"); var cache = Cache();
        await cache.SaveAsync(song, Packet(song, "previous"), "qq:previous", true); Candidates();
        var held = new TaskCompletionSource<LyricContentQuality>(TaskCreationOptions.RunContinuationsAsynchronously);
        TestProviders.InspectionHandler = _ => held.Task;
        using var host = new MainWindow(); await host.Resolve(song); await host.Search(song.Title, song.Artist);
        await host.Select("qq:new", song.Key).WaitAsync(Limit);
        check(host.Status.Phase == "failed" && host.Status.Message.Contains("超时") && !host.Status.Busy && host.PendingInspections == 0
            && host.Packets.Single().Content.Contains("previous") && await cache.ReadAsync(song) is { CandidateKey: "qq:previous" },
            "manual parser inspection times out after its existing deadline, releases its request and keeps the old visible and saved lyric");
        held.TrySetResult(new(true, true));
        await Task.WhenAll(host.InspectionReplies).WaitAsync(Limit);
        check(host.Packets.Count == 1 && host.Status.Phase == "failed", "a late successful parser reply cannot revive a timed-out manual choice");
    }

    // Explicit parser gates expose the cancellation boundary without relying on fast or slow machines.
    private static async Task SongChangeCancelsManualInspection(Action<bool, string> check)
    {
        DataFiles.Reset(); var old = SongOf("Manual parser old song"); var next = SongOf("Manual parser next song"); var cache = Cache();
        await cache.SaveAsync(old, Packet(old, "previous"), "qq:previous", true);
        await cache.SaveAsync(next, Packet(next, "next"), "qq:next", true); Candidates();
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var held = new TaskCompletionSource<LyricContentQuality>(TaskCreationOptions.RunContinuationsAsynchronously);
        TestProviders.InspectionHandler = _ => { entered.TrySetResult(); return held.Task; };
        using var host = new MainWindow(); await host.Resolve(old); await host.Search(old.Title, old.Artist); var pending = host.Select("qq:new", old.Key);
        await entered.Task.WaitAsync(Limit); await host.Resolve(next); await pending.WaitAsync(Limit); held.TrySetResult(new(true, true));
        await Task.WhenAll(host.InspectionReplies).WaitAsync(Limit);
        check(host.PendingInspections == 0 && host.Status.Key == next.Key && host.Packets.Count == 2 && host.Packets.Last().Key == next.Key
            && await cache.ReadAsync(old) is { CandidateKey: "qq:previous" },
            "changing songs cancels manual inspection and a late response cannot publish or save over either song");
    }

    private static async Task NewChoiceCancelsManualInspection(Action<bool, string> check)
    {
        DataFiles.Reset(); var song = SongOf("Manual parser replacement"); var cache = Cache();
        await cache.SaveAsync(song, Packet(song, "previous"), "qq:previous", true); Candidates();
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var held = new TaskCompletionSource<LyricContentQuality>(TaskCreationOptions.RunContinuationsAsynchronously);
        TestProviders.InspectionHandler = _ => { entered.TrySetResult(); return held.Task; };
        using var host = new MainWindow(); await host.Resolve(song); await host.Search(song.Title, song.Artist); var pending = host.Select("qq:new", song.Key);
        await entered.Task.WaitAsync(Limit);
        TestProviders.InspectionHandler = _ => Task.FromResult(new LyricContentQuality(true, false));
        TestProviders.FetchHandler = (_, target, _) => Task.FromResult<Lyrics?>(Packet(target, "newer manual"));
        await host.Select("kugou:new", song.Key); await pending.WaitAsync(Limit); held.TrySetResult(new(true, true));
        await Task.WhenAll(host.InspectionReplies).WaitAsync(Limit);
        check(host.PendingInspections == 0 && host.Status.SelectedKey == "kugou:new" && host.Packets.Count == 2
            && host.Packets.Last().Content.Contains("newer manual") && await cache.ReadAsync(song) is { Manual: true, CandidateKey: "kugou:new" },
            "a newer manual choice cancels an older inspection and remains the only applied and remembered replacement");
    }

    private static async Task UnsavedImportKeepsPreviousBinding(Action<bool, string> check)
    {
        DataFiles.Reset(); var song = SongOf("Unsaved local import"); var cache = Cache();
        await cache.SaveAsync(song, Packet(song, "previous online"), "qq:previous", true);
        var path = Path.Combine(DataFiles.Root, "unsaved-import.lrc"); File.WriteAllText(path, "[00:01.00]unsaved local");
        using var host = new MainWindow(); await host.Resolve(song); DataFiles.SaveFails = true; await host.Import(path);
        check(host.Packets.Count == 2 && host.Packets.Last().Content.Contains("unsaved local") && host.Status.Phase == "ready"
            && host.Notices.Single().Text("text").Contains("本次导入有效，但未保存"),
            "a local import that fails to save remains visible for this session and explicitly reports that its binding was not saved");
        check(await cache.ReadAsync(song) is { Manual: true, CandidateKey: "qq:previous" },
            "an unsaved local import preserves the existing persistent online choice instead of forgetting it");
        var next = SongOf("Other song during unsaved import");
        await cache.SaveAsync(next, Packet(next, "other online"), "qq:other", true);
        await host.Resolve(next); await host.Resolve(song);
        check(host.Packets.Last().Content.Contains("unsaved local") && host.Packets.Last().Key == song.Key,
            "returning to a song in the same session keeps its unsaved imported binding ahead of the preserved old online choice");
        var library = (LyricLibrary)typeof(MainWindow).GetField("library", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(host)!;
        DataFiles.SaveFails = false;
        var saved = await library.Scan(DataFiles.Root, _ => { }, CancellationToken.None);
        await host.Resolve(next); await host.Resolve(song);
        check(saved && library.HasSessionImportOverride(song) && host.Packets.Last().Content.Contains("unsaved local"),
            "a successful rescan saves the library without retracting the current session's latest explicit local import choice");
        using (var restart = new MainWindow())
        {
            await restart.Resolve(song);
            check(!new LyricLibrary().HasSessionImportOverride(song) && restart.Packets.Single().Content.Contains("previous online"),
                "a fresh session has no temporary import override and can recover the older preserved persistent online choice");
        }
        Candidates(); await host.Search(song.Title, song.Artist); await host.Select("netease:new", song.Key);
        await host.Resolve(next); await host.Resolve(song);
        check(!library.HasSessionImportOverride(song) && host.Packets.Last().Source == "netease"
            && await cache.ReadAsync(song) is { Manual: true, CandidateKey: "netease:new" },
            "a later validated manual online choice clears the temporary local override and survives returning to the song");
    }

    // Pause only the isolated save attempt so the song changes before the original UI continuation can inspect its failed result.
    private static async Task SongChangeDuringUnsavedImport(Action<bool, string> check)
    {
        DataFiles.Reset(); var old = SongOf("Unsaved import old song"); var next = SongOf("Unsaved import next song"); var cache = Cache();
        await cache.SaveAsync(old, Packet(old, "previous online"), "qq:previous", true);
        await cache.SaveAsync(next, Packet(next, "next online"), "qq:next", true);
        var path = Path.Combine(DataFiles.Root, "unsaved-import-switch.lrc"); File.WriteAllText(path, "[00:01.00]old imported");
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var release = new ManualResetEventSlim();
        DataFiles.SaveFails = true;
        DataFiles.BeforeTrySave = () => { entered.TrySetResult(); if (!release.Wait(Limit)) throw new TimeoutException("isolated import save gate"); };
        using var host = new MainWindow(); await host.Resolve(old);
        var ui = new PausedResolverContext(); var previous = SynchronizationContext.Current; Task importing;
        try { SynchronizationContext.SetSynchronizationContext(ui); importing = host.Import(path); }
        finally { SynchronizationContext.SetSynchronizationContext(previous); }
        try
        {
            await entered.Task.WaitAsync(Limit); release.Set(); await ui.Posted.Task.WaitAsync(Limit);
            await host.Resolve(next).WaitAsync(Limit); ui.Drain(); await importing.WaitAsync(Limit);
            var notice = host.Notices.Single().Text("text");
            check(notice.Contains("未保存") && !notice.StartsWith("歌词已保存", StringComparison.Ordinal) && host.Status.Key == next.Key
                && host.Packets.Count == 2 && host.Packets.Last().Key == next.Key && await cache.ReadAsync(old) is { CandidateKey: "qq:previous" },
                "a song change during a failed import preserves the new song and old online binding and cannot falsely announce that lyrics were saved");
        }
        finally { release.Set(); DataFiles.BeforeTrySave = null; }
    }
}
