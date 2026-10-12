using FoliaLyrics;

// test/lyric-performance/PreferredCacheChecks.cs: Re-evaluate legacy automatic downloads under QQ-first policy using isolated files and offline providers.
internal static class PreferredCacheChecks
{
    private static readonly TimeSpan Limit = TimeSpan.FromSeconds(6);
    private static Song SongOf(string name) => new(name, name, "Test", "", "", false, 0, 180, 1, true, [], "Album");
    private static Lyrics Packet(Song song, string source, string text) => new(song.Key, song.Title, song.Artist, "[00:01.00]" + text, source, "", false);
    private static OnlineCache Cache() => new(Path.Combine(DataFiles.Root, "online-lyrics"));
    private static TaskCompletionSource Signal() => new(TaskCreationOptions.RunContinuationsAsynchronously);
    private static void ClearCalls() { TestProviders.Searches.Clear(); TestProviders.Fetches.Clear(); }
    private static void ReadyQq(double durationDelta = 0)
    {
        TestProviders.SearchHandler = (query, providers, _) => Task.FromResult(new OnlineSearchResult(
            [new(providers.Single(), "preferred", query.Title, query.Artist, query.Album, query.Duration + durationDelta, "timed")], []));
        TestProviders.FetchHandler = (candidate, target, _) => Task.FromResult<Lyrics?>(Packet(target, candidate.Provider, "new QQ"));
    }

    public static async Task Run(Action<bool, string> check)
    {
        await PreserveInstantChoices(check);
        await EnablingQqEvaluatesPreviouslyDisabledMatch(check);
        await RefreshOnce(check);
        await IneligibleFallsBackOnce(check);
        await UnavailableQqFallsBack(check);
        await SlowSearchFallsBack(check);
        await SlowDownloadFallsBack(check);
        await SongChangeCancelsRefresh(check);
        await ManualChoiceCancelsRefresh(check);
    }

    private static async Task PreserveInstantChoices(Action<bool, string> check)
    {
        foreach (var setting in new[] { "offline", "QQ disabled", "manual", "current policy", "local" })
        {
            DataFiles.Reset(); var song = SongOf("PriorityKeep " + setting); var cache = Cache();
            var manual = setting == "manual"; var provider = setting == "current policy" ? "qq" : "kugou";
            await cache.SaveAsync(song, Packet(song, provider, "old cache"), provider + ":legacy", manual, setting == "current policy" ? OnlineLyrics.PriorityPolicyVersion : 0);
            if (setting == "local")
            {
                var path = Path.Combine(DataFiles.Root, "priority-local.lrc");
                File.WriteAllText(path, $"[ti:{song.Title}]\n[ar:{song.Artist}]\n[00:01.00]local first");
                DataFiles.Save("library.json", new LibraryState { Entries = [new(path, song.Title, song.Artist)] });
            }
            ReadyQq();
            using var host = new MainWindow(new Preferences { OnlineEnabled = setting != "offline", OnlineProviders = setting == "QQ disabled" ? ["kugou"] : OnlineLyrics.ProviderIds });
            await host.Resolve(song).WaitAsync(Limit);
            check(TestProviders.Searches.IsEmpty && TestProviders.Fetches.IsEmpty && host.Packets.Count == 1,
                "QQ-first cache policy preserves immediate lookup without networking: " + setting);
            check(host.Packets.Single().Content.Contains(setting == "local" ? "local first" : "old cache"),
                "QQ-first cache policy retains the intended lyric choice: " + setting);
            check((await cache.ReadAsync(song))?.PriorityPolicy == (setting == "current policy" ? OnlineLyrics.PriorityPolicyVersion : 0),
                "an immediate local/manual/offline/disabled/current-policy hit does not falsely mark an old cache re-evaluated: " + setting);
        }
    }

    private static async Task RefreshOnce(Action<bool, string> check)
    {
        DataFiles.Reset(); var song = SongOf("PriorityRefresh"); var cache = Cache();
        await cache.SaveAsync(song, Packet(song, "kugou", "old cache"), "kugou:legacy", false); ReadyQq();
        using (var host = new MainWindow())
        {
            await host.Resolve(song).WaitAsync(Limit);
            check(host.Packets.Single().Source == "qq" && host.Packets.Single().Content.Contains("new QQ")
                && TestProviders.Searches.SelectMany(page => page).Order().SequenceEqual(OnlineLyrics.ProviderIds.Order()),
                "a legacy automatic non-QQ cache evaluates all enabled sources and publishes one preferred lyric packet");
        }
        var saved = await cache.ReadAsync(song);
        check(saved is { CandidateKey: "qq:preferred", Manual: false } && saved.PriorityPolicy == OnlineLyrics.PriorityPolicyVersion,
            "a successful preferred refresh records the new automatic priority policy");
        ClearCalls();
        using var restarted = new MainWindow(); await restarted.Resolve(song with { Key = "priority-refresh-new-session" }).WaitAsync(Limit);
        check(TestProviders.Searches.IsEmpty && TestProviders.Fetches.IsEmpty && restarted.Packets.Single().Key == "priority-refresh-new-session",
            "a preferred refreshed cache survives restart and session changes without another network lookup");
    }

    private static async Task EnablingQqEvaluatesPreviouslyDisabledMatch(Action<bool, string> check)
    {
        DataFiles.Reset(); var song = SongOf("PriorityEnableQq"); ReadyQq();
        using (var withoutQq = new MainWindow(new Preferences { OnlineProviders = ["kugou"] }))
        {
            await withoutQq.Resolve(song).WaitAsync(Limit);
            check(withoutQq.Packets.Single().Source == "kugou" && (await Cache().ReadAsync(song))?.PriorityPolicy == 0,
                "an automatic match created with QQ disabled does not claim to have evaluated QQ priority");
        }
        ClearCalls();
        using var enabled = new MainWindow(); await enabled.Resolve(song).WaitAsync(Limit);
        check(enabled.Packets.Single().Source == "qq" && TestProviders.Searches.SelectMany(page => page).Order().SequenceEqual(OnlineLyrics.ProviderIds.Order()),
            "enabling QQ later re-evaluates a non-QQ automatic cache made while QQ was disabled");
    }

    private static async Task IneligibleFallsBackOnce(Action<bool, string> check)
    {
        DataFiles.Reset(); var song = SongOf("PriorityWrongVersion"); var cache = Cache();
        await cache.SaveAsync(song, Packet(song, "kugou", "valid fallback"), "kugou:legacy", false); ReadyQq(3);
        using (var host = new MainWindow())
        {
            await host.Resolve(song).WaitAsync(Limit);
            check(host.Packets.Single().Source == "qq" && !TestProviders.Fetches.IsEmpty
                && host.Status.Candidates.All(candidate => !candidate.AutoEligible) && host.Status.Phase == "ready",
                "the new forced-choice policy permits the highest available QQ version below the former duration threshold");
        }
        check((await cache.ReadAsync(song))?.PriorityPolicy == OnlineLyrics.PriorityPolicyVersion,
            "an evaluated cached fallback records the current source policy");
        ClearCalls();
        using var restarted = new MainWindow(); await restarted.Resolve(song).WaitAsync(Limit);
        check(TestProviders.Searches.IsEmpty && restarted.Packets.Single().Source == "qq",
            "an evaluated cached fallback avoids repeated automatic network requests");
        await cache.ForgetAsync(song); ReadyQq(); ClearCalls();
        using var reset = new MainWindow(); await reset.Resolve(song).WaitAsync(Limit);
        check(reset.Packets.Single().Source == "qq" && !TestProviders.Searches.IsEmpty,
            "clearing a cached fallback allows the next automatic match to try QQ again");
    }

    // A failed preferred provider retains its diagnostic while the known-valid cache keeps the current song available.
    private static async Task UnavailableQqFallsBack(Action<bool, string> check)
    {
        DataFiles.Reset(); var song = SongOf("PriorityUnavailableQq"); var cache = Cache();
        await cache.SaveAsync(song, Packet(song, "kugou", "valid fallback"), "kugou:legacy", false);
        TestProviders.SearchHandler = (_, _, _) => Task.FromException<OnlineSearchResult>(new IOException("synthetic QQ unavailable"));
        using var host = new MainWindow(); await host.Resolve(song).WaitAsync(Limit);
        check(host.Packets.Single().Content.Contains("valid fallback") && host.Status.Phase == "ready" && !host.Status.Busy && TestProviders.Fetches.IsEmpty,
            "a failing QQ provider keeps the valid cached lyric ready without a second lyric publication");
        check(host.Status.Errors.All(error => error.Contains("synthetic QQ unavailable")) && host.Status.Errors.Length == OnlineLyrics.ProviderIds.Length && (await cache.ReadAsync(song))?.PriorityPolicy == OnlineLyrics.PriorityPolicyVersion,
            "an unavailable preferred source records its error and evaluated cache policy");
    }

    // A provider that ignores cancellation must not prevent using the already-valid cached result after the shared search grace.
    private static async Task SlowSearchFallsBack(Action<bool, string> check)
    {
        DataFiles.Reset(); var song = SongOf("PrioritySlowSearch"); var cache = Cache(); var entered = Signal();
        var held = new TaskCompletionSource<OnlineSearchResult>(TaskCreationOptions.RunContinuationsAsynchronously); CancellationToken searchToken = default;
        await cache.SaveAsync(song, Packet(song, "kugou", "valid fallback"), "kugou:legacy", false);
        TestProviders.SearchHandler = (_, _, token) => { searchToken = token; entered.TrySetResult(); return held.Task; };
        using var host = new MainWindow(); host.SetAutomaticSearchTimeout(TimeSpan.FromMilliseconds(150)); var pending = host.Resolve(song);
        try
        {
            await entered.Task.WaitAsync(Limit); await pending.WaitAsync(Limit);
            check(searchToken.IsCancellationRequested && !held.Task.IsCompleted && host.Packets.Single().Source == "kugou",
                "an uncooperative QQ search falls back to the valid cache after its bounded search window");
            check(host.Status.Errors.Any(error => error.Contains("请求超时")) && TestProviders.Fetches.IsEmpty,
                "a slow preferred-cache search reports its timeout without fetching a late result");
        }
        finally { held.TrySetResult(new([new("qq", "late", song.Title, song.Artist, song.Album, song.Duration, "timed")], [])); }
        check(host.Packets.Count == 1, "a late preferred-cache search never reloads over the published fallback");
    }

    private static async Task SlowDownloadFallsBack(Action<bool, string> check)
    {
        DataFiles.Reset(); var song = SongOf("PrioritySlowDownload"); var cache = Cache(); var entered = Signal();
        var held = new TaskCompletionSource<Lyrics?>(TaskCreationOptions.RunContinuationsAsynchronously); CancellationToken downloadToken = default;
        await cache.SaveAsync(song, Packet(song, "kugou", "valid fallback"), "kugou:legacy", false); ReadyQq();
        TestProviders.FetchHandler = (_, _, token) => { downloadToken = token; entered.TrySetResult(); return held.Task; };
        using var host = new MainWindow(); var pending = host.Resolve(song);
        try
        {
            await entered.Task.WaitAsync(Limit); await pending.WaitAsync(Limit);
            check(downloadToken.IsCancellationRequested && !held.Task.IsCompleted && host.Packets.Single().Source == "kugou",
                "an uncooperative QQ lyric download falls back to cached lyrics after the existing download timeout");
            check(host.Status.Errors.Any(error => error.Contains("歌词获取超时")), "preferred-cache download timeout remains visible in source errors");
        }
        finally { held.TrySetResult(Packet(song, "qq", "late preferred")); }
        check(host.Packets.Count == 1 && (await cache.ReadAsync(song))?.CandidateKey == "kugou:legacy",
            "a late preferred-cache download cannot overwrite the accepted cached fallback");
    }

    private static async Task SongChangeCancelsRefresh(Action<bool, string> check)
    {
        DataFiles.Reset(); var old = SongOf("PriorityOldSong"); var next = SongOf("PriorityNextSong"); var cache = Cache(); var entered = Signal();
        var held = new TaskCompletionSource<OnlineSearchResult>(TaskCreationOptions.RunContinuationsAsynchronously);
        await cache.SaveAsync(old, Packet(old, "kugou", "old fallback"), "kugou:legacy", false);
        var localPath = Path.Combine(DataFiles.Root, "next-priority.lrc"); File.WriteAllText(localPath, $"[ti:{next.Title}]\n[ar:{next.Artist}]\n[00:01.00]next local");
        DataFiles.Save("library.json", new LibraryState { Entries = [new(localPath, next.Title, next.Artist)] });
        TestProviders.SearchHandler = (_, _, _) => { entered.TrySetResult(); return held.Task; };
        using var host = new MainWindow(); var pending = host.Resolve(old);
        try
        {
            await entered.Task.WaitAsync(Limit); await host.Resolve(next).WaitAsync(Limit); await pending.WaitAsync(Limit);
            check(host.Packets.Single().Key == next.Key && host.Packets.Single().Content.Contains("next local") && host.Status.Key == next.Key,
                "switching songs during a preferred-cache refresh preserves the new local lyrics and status");
            check((await cache.ReadAsync(old))?.PriorityPolicy == 0,
                "a canceled preferred-cache refresh never marks an unevaluated old song as complete");
        }
        finally { held.TrySetResult(new([new("qq", "late", old.Title, old.Artist, old.Album, old.Duration, "timed")], [])); }
        check(host.Packets.Count == 1 && TestProviders.Fetches.IsEmpty, "obsolete preferred-cache results cannot fetch or publish over a newer song");
    }

    private static async Task ManualChoiceCancelsRefresh(Action<bool, string> check)
    {
        DataFiles.Reset(); var song = SongOf("PriorityManualChoice"); var cache = Cache(); var entered = Signal();
        var held = new TaskCompletionSource<Lyrics?>(TaskCreationOptions.RunContinuationsAsynchronously);
        await cache.SaveAsync(song, Packet(song, "kugou", "old cache"), "kugou:legacy", false); ReadyQq();
        TestProviders.FetchHandler = (_, _, _) => { entered.TrySetResult(); return held.Task; };
        using var host = new MainWindow(); var pending = host.Resolve(song);
        try
        {
            await entered.Task.WaitAsync(Limit);
            await host.Search(song.Title, song.Artist).WaitAsync(Limit); await pending.WaitAsync(Limit);
            TestProviders.FetchHandler = (candidate, target, _) => Task.FromResult<Lyrics?>(Packet(target, candidate.Provider, "manual choice"));
            await host.Select("kugou:preferred", song.Key).WaitAsync(Limit);
            check(host.Packets.Single().Content.Contains("manual choice") && host.Status.SelectedKey == "kugou:preferred",
                "a new manual online search and selection cancel a pending automatic QQ cache refresh");
            check(await cache.ReadAsync(song) is { Manual: true, CandidateKey: "kugou:preferred" },
                "a manual source choice during preferred-cache refresh persists independently of automatic policy");
        }
        finally { held.TrySetResult(Packet(song, "qq", "late preferred")); }
        check(host.Packets.Count == 1 && host.Status.SelectedKey == "kugou:preferred",
            "a late QQ refresh cannot reload over a newer manual selection");
    }
}
