using FoliaLyrics;

// test/lyric-performance/ManualOnlineDeadlineChecks.cs — bound manual work and cancel requests without clearing an accepted lyric or selection.
internal static class ManualOnlineDeadlineChecks
{
    private static readonly TimeSpan Limit = TimeSpan.FromSeconds(6);
    private static Song SongOf(string title) => new(title, title, "Artist", "", "", false, 0, 180, 1, true, [], "Album");
    private static Lyrics Packet(Song song, string text) => new(song.Key, song.Title, song.Artist, "[00:01.00]" + text, "deadline test", "", false, "lrc");
    private static TaskCompletionSource Signal() => new(TaskCreationOptions.RunContinuationsAsynchronously);
    // The outer deadline can resume before the token finishes dispatching its cancellation callbacks.
    private static async Task WaitForInspectionCleanup(MainWindow host)
    {
        using var deadline = new CancellationTokenSource(Limit);
        while (host.PendingInspections > 0) await Task.Delay(1, deadline.Token);
    }
    private static void Candidates() => TestProviders.SearchHandler = (query, sources, _) => Task.FromResult(new OnlineSearchResult(sources.Select(source =>
        new LyricCandidate(source, "new", query.Title, query.Artist, query.Album, query.Duration, "timed")).ToArray(), []));
    private static async Task<MainWindow> Ready(Song song)
    {
        var cache = new OnlineCache(Path.Combine(DataFiles.Root, "online-lyrics"));
        await cache.SaveAsync(song, Packet(song, "previous"), "qq:previous", true);
        var host = new MainWindow(); await host.Resolve(song); return host;
    }

    public static async Task Run(Action<bool, string> check)
    {
        await DownloadDeadline(check);
        await InspectionSharesDeadline(check);
        await CancelSearch(check);
        await CancelDownloadAndRetry(check);
        await CancelInspection(check);
        await CancelWithoutLyrics(check);
    }

    private static async Task DownloadDeadline(Action<bool, string> check)
    {
        DataFiles.Reset(); Candidates(); var song = SongOf("Manual whole download timeout");
        var held = new TaskCompletionSource<Lyrics?>(TaskCreationOptions.RunContinuationsAsynchronously); CancellationToken received = default;
        TestProviders.FetchHandler = (_, _, token) => { received = token; return held.Task; };
        using var host = await Ready(song); host.SetManualSelectionTimeout(TimeSpan.FromMilliseconds(150)); await host.Search(song.Title, song.Artist);
        await host.Select("qq:new", song.Key).WaitAsync(Limit);
        check(received.IsCancellationRequested && !held.Task.IsCompleted && host.Status.Phase == "failed" && host.Status.Message.Contains("超时")
            && !host.Status.Busy && host.Packets.Single().Content.Contains("previous"),
            "the complete manual download deadline returns even when a provider ignores cancellation and preserves the accepted lyric");
        held.TrySetException(new IOException("late ignored manual download failure"));
        try { await held.Task; } catch (IOException) { }
        check(host.Packets.Count == 1 && host.Status.Phase == "failed", "a late failing manual provider cannot revive a timed-out selection");
    }

    private static async Task InspectionSharesDeadline(Action<bool, string> check)
    {
        DataFiles.Reset(); Candidates(); var song = SongOf("Manual shared parser deadline"); var entered = Signal();
        var held = new TaskCompletionSource<LyricContentQuality>(TaskCreationOptions.RunContinuationsAsynchronously);
        TestProviders.InspectionHandler = _ => { entered.TrySetResult(); return held.Task; };
        using var host = await Ready(song); host.SetManualSelectionTimeout(TimeSpan.FromMilliseconds(300)); await host.Search(song.Title, song.Artist);
        var pending = host.Select("qq:new", song.Key); await entered.Task.WaitAsync(Limit); await pending.WaitAsync(TimeSpan.FromSeconds(2));
        await WaitForInspectionCleanup(host);
        check(host.PendingInspections == 0 && host.Status.Phase == "failed" && host.Status.Message.Contains("超时") && host.Packets.Count == 1,
            "real parser inspection consumes the same total manual budget and removes its pending registry entry at timeout");
        held.TrySetResult(new(true, true)); await Task.WhenAll(host.InspectionReplies).WaitAsync(Limit);
        check(host.Packets.Count == 1, "a parser reply after the total selection deadline cannot apply lyrics");
    }

    private static async Task CancelSearch(Action<bool, string> check)
    {
        DataFiles.Reset(); var song = SongOf("Cancel complete manual search"); var entered = Signal(); CancellationToken received = default;
        var held = new TaskCompletionSource<OnlineSearchResult>(TaskCreationOptions.RunContinuationsAsynchronously);
        TestProviders.SearchHandler = (_, _, token) => { received = token; entered.TrySetResult(); return held.Task; };
        using var host = await Ready(song); var pending = host.Search(song.Title, song.Artist); await entered.Task.WaitAsync(Limit);
        host.CancelOnline(); await pending.WaitAsync(Limit);
        check(received.IsCancellationRequested && !held.Task.IsCompleted && !host.Status.Busy && host.Status.Phase == "ready"
            && host.Status.SelectedKey == "qq:previous" && host.Packets.Count == 1,
            "canceling a held manual search stops busy state and restores the identity of the already displayed selection");
        held.TrySetResult(new([], [])); await Task.WhenAll(TestProviders.SearchReplies).WaitAsync(Limit);
        check(host.Status.SelectedKey == "qq:previous" && host.Packets.Count == 1, "late canceled search pages cannot clear the retained selection");
    }

    // Retry before releasing the canceled provider so its old response cannot become the newer selection.
    private static async Task CancelDownloadAndRetry(Action<bool, string> check)
    {
        DataFiles.Reset(); Candidates(); var song = SongOf("Cancel manual download then retry"); var entered = Signal(); CancellationToken received = default;
        var held = new TaskCompletionSource<Lyrics?>(TaskCreationOptions.RunContinuationsAsynchronously);
        TestProviders.FetchHandler = (_, _, token) => { received = token; entered.TrySetResult(); return held.Task; };
        using var host = await Ready(song); await host.Search(song.Title, song.Artist); var pending = host.Select("qq:new", song.Key);
        await entered.Task.WaitAsync(Limit); host.CancelOnline(); await pending.WaitAsync(TimeSpan.FromSeconds(2));
        await WaitForInspectionCleanup(host);
        check(received.IsCancellationRequested && !held.Task.IsCompleted && host.Status.SelectedKey == "qq:previous" && host.Status.Phase == "ready"
            && !host.Status.Busy && host.Packets.Count == 1, "canceling a manual download does not wait for an uncooperative provider or replace the displayed lyric");
        TestProviders.FetchHandler = (candidate, target, _) => Task.FromResult<Lyrics?>(Packet(target, candidate.Key));
        await host.Select("netease:new", song.Key);
        held.TrySetResult(Packet(song, "late canceled lyric"));
        check(host.Status.SelectedKey == "netease:new" && host.Packets.Count == 2 && host.Packets.Last().Content.Contains("netease:new"),
            "a fresh valid choice can complete before the canceled provider responds and the late lyric cannot replace it");
    }

    private static async Task CancelInspection(Action<bool, string> check)
    {
        DataFiles.Reset(); Candidates(); var song = SongOf("Cancel real parser inspection"); var entered = Signal();
        var held = new TaskCompletionSource<LyricContentQuality>(TaskCreationOptions.RunContinuationsAsynchronously);
        TestProviders.InspectionHandler = _ => { entered.TrySetResult(); return held.Task; };
        using var host = await Ready(song); await host.Search(song.Title, song.Artist); var pending = host.Select("qq:new", song.Key);
        await entered.Task.WaitAsync(Limit); host.CancelOnline(); await pending.WaitAsync(TimeSpan.FromSeconds(2));
        await WaitForInspectionCleanup(host);
        check(host.PendingInspections == 0 && host.Status.SelectedKey == "qq:previous" && host.Packets.Count == 1 && !host.Status.Busy,
            "canceling parser inspection releases its request and retains the previous selection");
        held.TrySetResult(new(true, true)); await Task.WhenAll(host.InspectionReplies).WaitAsync(Limit);
        check(host.Status.SelectedKey == "qq:previous" && host.Packets.Count == 1, "a late positive parser reply cannot undo an explicit cancellation");
    }

    private static async Task CancelWithoutLyrics(Action<bool, string> check)
    {
        DataFiles.Reset(); var song = SongOf("Cancel without accepted lyric"); var preferences = new Preferences { OnlineEnabled = false };
        using var host = new MainWindow(preferences); await host.Resolve(song); preferences.OnlineEnabled = true;
        var held = new TaskCompletionSource<OnlineSearchResult>(TaskCreationOptions.RunContinuationsAsynchronously);
        TestProviders.SearchHandler = (_, _, _) => held.Task;
        var pending = host.Search(song.Title, song.Artist); host.CancelOnline(); await pending.WaitAsync(Limit); held.TrySetResult(new([], []));
        check(host.Packets.IsEmpty && host.Status.SelectedKey.Length == 0 && host.Status.Phase == "idle" && !host.Status.Busy,
            "canceling with no accepted lyrics returns to idle without fabricating a selected version");
        await Task.WhenAll(TestProviders.SearchReplies).WaitAsync(Limit);
    }
}
