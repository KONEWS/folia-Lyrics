using FoliaLyrics;

// test/lyric-performance/EarlyQqSelectionChecks.cs — complete QQ ranking can publish its word winner while other searches remain pending.
internal static class EarlyQqSelectionChecks
{
    private static readonly TimeSpan Limit = TimeSpan.FromSeconds(5);
    private static Song SongOf(string name) => new(name, name, "Artist", "", "", false, 0, 180, 1, true, [], "Album");
    private static LyricCandidate Candidate(LyricQuery query, string provider, string id, bool exact = true) =>
        new(provider, id, query.Title, query.Artist, query.Album, exact ? query.Duration : query.Duration + 10, "advertised timing");
    private static Lyrics Packet(Song song, string source, bool word) => new(song.Key, song.Title, song.Artist,
        word ? "[1000,2000](1000,1000,0)word(2000,1000,0)timing" : "[00:01.00]line", source, "", false, word ? "yrc" : "lrc");
    private static OnlineCache Cache() => new(Path.Combine(DataFiles.Root, "online-lyrics"));

    public static async Task Run(Action<bool, string> check)
    {
        await SlowSourceDoesNotDelayWinner(check, false);
        await SlowSourceDoesNotDelayWinner(check, true);
        await QqLineStillWaitsForOtherWords(check);
        await SupersessionCancelsSupplement(check, false);
        await SupersessionCancelsSupplement(check, true);
    }

    // Keep a nonpreferred page pending until the verified selection is already visible and cached.
    private static async Task SlowSourceDoesNotDelayWinner(Action<bool, string> check, bool legacyCache)
    {
        DataFiles.Reset(); var song = SongOf("Early QQ winner " + legacyCache); var cache = Cache();
        if (legacyCache) await cache.SaveAsync(song, Packet(song, "old line cache", false), "qq:legacy", false, 1);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        TestProviders.SearchHandler = async (query, sources, _) =>
        {
            var provider = sources.Single();
            if (provider == "lrclib") { entered.TrySetResult(); await release.Task; throw new IOException("late source error"); }
            return new(provider == "qq" ? [Candidate(query, provider, "lower-word", false), Candidate(query, provider, "best-word")]
                : [Candidate(query, provider, "alternative")], []);
        };
        TestProviders.FetchHandler = (candidate, target, _) => Task.FromResult<Lyrics?>(Packet(target, candidate.Key, true));
        using var host = new MainWindow(); var pending = host.Resolve(song);
        try
        {
            await entered.Task.WaitAsync(Limit); var selected = await host.FirstSelection.Task.WaitAsync(Limit);
            check(!pending.IsCompleted && selected.SelectedKey == "qq:best-word" && selected.Phase == "ready" && !selected.Busy
                && host.Packets.Single().Source == "qq:best-word" && await cache.ReadAsync(song) is { CandidateKey: "qq:best-word", Manual: false },
                "the complete QQ page publishes its highest-ranked real word winner before a slow source finishes: legacy=" + legacyCache);
        }
        finally { release.TrySetResult(); }
        await pending.WaitAsync(Limit);
        check(host.Packets.Count == 1 && host.Status.SelectedKey == "qq:best-word" && host.Status.Candidates.Length == 4
            && host.Status.Candidates.Any(candidate => candidate.Provider == "netease") && host.Status.Errors.Any(error => error.Contains("late source error")),
            "background search completion supplements candidates and errors without replacing or republishing the winner: legacy=" + legacyCache);
    }

    private static async Task QqLineStillWaitsForOtherWords(Action<bool, string> check)
    {
        DataFiles.Reset(); var song = SongOf("Late higher-ranked non-QQ word");
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var qqInspected = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        TestProviders.SearchHandler = async (query, sources, _) =>
        {
            var provider = sources.Single(); if (provider == "netease") await release.Task;
            return new([Candidate(query, provider, provider == "qq" ? "line" : "word", provider != "kugou")], []);
        };
        TestProviders.FetchHandler = (candidate, target, _) => Task.FromResult<Lyrics?>(Packet(target, candidate.Key, candidate.Provider != "qq"));
        TestProviders.InspectionHandler = packet =>
        {
            if (packet.Source.StartsWith("qq:")) qqInspected.TrySetResult();
            return Task.FromResult(new LyricContentQuality(true, packet.Format == "yrc"));
        };
        using var host = new MainWindow(); var pending = host.Resolve(song);
        try
        {
            await qqInspected.Task.WaitAsync(Limit);
            check(host.Packets.IsEmpty && !pending.IsCompleted, "a QQ line fallback cannot publish ahead of a pending non-QQ word source");
        }
        finally { release.TrySetResult(); }
        await pending.WaitAsync(Limit);
        check(host.Status.SelectedKey == "netease:word" && host.Packets.Single().Source == "netease:word",
            "non-QQ word candidates retain their global highest-score priority after all search pages complete");
    }

    private static async Task SupersessionCancelsSupplement(Action<bool, string> check, bool manual)
    {
        DataFiles.Reset(); var song = SongOf("Early QQ superseded " + manual); var next = SongOf("Next cached song " + manual); var cache = Cache();
        await cache.SaveAsync(next, Packet(next, "next cache", false), "qq:next", true);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        CancellationToken slowToken = default;
        TestProviders.SearchHandler = async (query, sources, token) =>
        {
            var provider = sources.Single();
            if (provider == "lrclib") { slowToken = token; await release.Task; }
            return new([Candidate(query, provider, "automatic")], []);
        };
        using var host = new MainWindow(); var pending = host.Resolve(song);
        try
        {
            await host.FirstSelection.Task.WaitAsync(Limit);
            if (manual)
            {
                TestProviders.SearchHandler = (query, sources, _) => Task.FromResult(new OnlineSearchResult([Candidate(query, sources.Single(), "manual")], []));
                await host.Search(song.Title, song.Artist); await host.Select("netease:manual", song.Key);
            }
            else await host.Resolve(next);
            await pending.WaitAsync(Limit);
            check(slowToken.IsCancellationRequested && host.Packets.Count == 2
                && (manual ? host.Status.SelectedKey == "netease:manual" : host.Status.Key == next.Key),
                "supersession cancels background candidate collection after an early QQ winner: manual=" + manual);
        }
        finally { release.TrySetResult(); }
        await Task.WhenAll(TestProviders.SearchReplies).WaitAsync(Limit);
        check(host.Packets.Count == 2 && (manual ? await cache.ReadAsync(song) is { Manual: true, CandidateKey: "netease:manual" }
            : host.Packets.Last().Key == next.Key), "late supplemental results cannot overwrite the newer visible or saved selection: manual=" + manual);
    }
}
