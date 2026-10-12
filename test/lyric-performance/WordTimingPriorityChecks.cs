using System.Reflection;
using FoliaLyrics;

// test/lyric-performance/WordTimingPriorityChecks.cs: Exercise the real facade, resolver, cache and inspection correlation entirely offline.
internal static class WordTimingPriorityChecks
{
    private static readonly TimeSpan Limit = TimeSpan.FromSeconds(8);
    private static Song SongOf(string name) => new(name, name, "Artist", "", "", false, 0, 180, 1, true, [], "Album");
    private static LyricCandidate Candidate(Song song, string provider, string id, bool exact = true, bool album = true) =>
        new(provider, id, song.Title, song.Artist, album ? song.Album : "Other", exact ? song.Duration : song.Duration + 10, "advertised word timing");
    private static Lyrics Packet(Song song, LyricCandidate candidate, bool word) => new(song.Key, song.Title, song.Artist,
        word ? "[1000,2000](1000,1000,0)word(2000,1000,0)timing" : "[00:01.00]line timing", candidate.Provider + ":" + candidate.Id, "", false, word ? "yrc" : "lrc");
    private static void Configure(Song song, LyricCandidate[] candidates, params string[] wordKeys)
    {
        DataFiles.Reset();
        TestProviders.SearchHandler = (_, sources, _) => Task.FromResult(new OnlineSearchResult(candidates.Where(candidate => sources.Contains(candidate.Provider)).ToArray(), []));
        TestProviders.FetchHandler = (candidate, target, _) => Task.FromResult<Lyrics?>(Packet(target, candidate, wordKeys.Contains(candidate.Key)));
    }

    public static async Task Run(Action<bool, string> check)
    {
        await QqWordPriority(check);
        await CrossProviderWordPriority(check);
        await LineFallbackAndUnusableContent(check);
        await LegacyQqCacheRefresh(check);
        await HiddenCandidateCanWin(check);
        await ProviderDownloadQueue(check);
        await InspectionCorrelation(check);
        await CancelledInspectionCannotPublish(check);
    }

    private static async Task QqWordPriority(Action<bool, string> check)
    {
        var song = SongOf("QQ word priority");
        Configure(song, [Candidate(song, "qq", "line"), Candidate(song, "qq", "word", album: false), Candidate(song, "netease", "word")], "qq:word", "netease:word");
        using (var host = new MainWindow())
        {
            await host.Resolve(song).WaitAsync(Limit);
            check(host.Status.SelectedKey == "qq:word" && host.Packets.Single().Format == "yrc",
                "a lower-scoring real QQ word lyric beats QQ line lyrics and higher-scoring word lyrics from another source");
        }
        song = SongOf("QQ best word");
        Configure(song, [Candidate(song, "qq", "low", exact: false), Candidate(song, "qq", "high"), Candidate(song, "netease", "high")], "qq:low", "qq:high", "netease:high");
        using var best = new MainWindow(); await best.Resolve(song).WaitAsync(Limit);
        check(best.Status.SelectedKey == "qq:high", "multiple actual QQ word versions select the highest matching score");
    }

    private static async Task CrossProviderWordPriority(Action<bool, string> check)
    {
        var song = SongOf("Cross-source word priority");
        Configure(song, [Candidate(song, "qq", "line"), Candidate(song, "kugou", "word", album: false), Candidate(song, "netease", "word")], "kugou:word", "netease:word");
        using (var host = new MainWindow())
        {
            await host.Resolve(song).WaitAsync(Limit);
            check(host.Status.SelectedKey == "netease:word", "QQ without real word timing falls back to the highest-scoring word lyric across enabled sources");
        }
        song = SongOf("Disabled QQ word priority");
        Configure(song, [Candidate(song, "qq", "word"), Candidate(song, "kugou", "word", album: false), Candidate(song, "netease", "word")], "qq:word", "kugou:word", "netease:word");
        using var disabled = new MainWindow(new Preferences { OnlineProviders = ["kugou", "netease"] }); await disabled.Resolve(song).WaitAsync(Limit);
        check(disabled.Status.SelectedKey == "netease:word" && TestProviders.Searches.All(sources => !sources.Contains("qq")),
            "word-priority matching respects disabled sources");
    }

    private static async Task LineFallbackAndUnusableContent(Action<bool, string> check)
    {
        var song = SongOf("Line fallback");
        Configure(song, [Candidate(song, "qq", "low", album: false), Candidate(song, "qq", "high"), Candidate(song, "netease", "line")]);
        using (var host = new MainWindow())
        {
            await host.Resolve(song).WaitAsync(Limit);
            check(host.Status.SelectedKey == "qq:high" && host.Packets.Single().Format == "lrc",
                "when no source has actual word timing the highest-scoring usable QQ line lyric is selected");
        }
        song = SongOf("QQ unavailable fallback");
        Configure(song, [Candidate(song, "qq", "empty"), Candidate(song, "kugou", "line", album: false), Candidate(song, "netease", "line")]);
        TestProviders.FetchHandler = (candidate, target, _) => Task.FromResult<Lyrics?>(candidate.Provider == "qq" ? null : Packet(target, candidate, false));
        using (var host = new MainWindow())
        {
            await host.Resolve(song).WaitAsync(Limit);
            check(host.Status.SelectedKey == "netease:line", "QQ with no usable content falls back to the highest-scoring available line lyric");
        }
        song = SongOf("Content validation");
        Configure(song, [Candidate(song, "qq", "empty"), Candidate(song, "qq", "fake-word", album: false)]);
        TestProviders.InspectionHandler = _ => Task.FromResult(new LyricContentQuality(false, true));
        using var invalid = new MainWindow(); await invalid.Resolve(song).WaitAsync(Limit);
        check(invalid.Packets.IsEmpty && invalid.Status.SelectedKey.Length == 0, "provider labels and claimed word timing cannot select content that the actual parser rejects");
    }

    private static async Task LegacyQqCacheRefresh(Action<bool, string> check)
    {
        var song = SongOf("Legacy QQ line cache"); var candidates = new[] { Candidate(song, "qq", "word") };
        Configure(song, candidates, "qq:word");
        var cache = new OnlineCache(Path.Combine(DataFiles.Root, "online-lyrics"));
        await cache.SaveAsync(song, Packet(song, Candidate(song, "qq", "legacy"), false), "qq:legacy", false, 1);
        using (var host = new MainWindow())
        {
            await host.Resolve(song).WaitAsync(Limit);
            check(host.Status.SelectedKey == "qq:word" && (await cache.ReadAsync(song))?.PriorityPolicy == OnlineLyrics.PriorityPolicyVersion,
                "a QQ automatic cache from the earlier policy re-evaluates real word timing once");
        }
        TestProviders.Searches.Clear(); TestProviders.Fetches.Clear();
        using var restart = new MainWindow(); await restart.Resolve(song).WaitAsync(Limit);
        check(TestProviders.Searches.IsEmpty && TestProviders.Fetches.IsEmpty && restart.Packets.Single().Format == "yrc",
            "the current automatic word policy reuses its cache without repeating provider lookups");
    }

    private static async Task HiddenCandidateCanWin(Action<bool, string> check)
    {
        var song = SongOf("Full search ranking");
        var candidates = Enumerable.Range(0, 45).Select(index => Candidate(song, "qq", "line" + index)).Append(Candidate(song, "netease", "word")).ToArray();
        Configure(song, candidates, "netease:word");
        using var host = new MainWindow(); await host.Resolve(song).WaitAsync(Limit);
        check(host.Status.SelectedKey == "netease:word" && host.Status.Candidates.Length == 40 && host.Status.Candidates.Any(candidate => candidate.Key == "netease:word"),
            "a word lyric outside the visible result limit can win and its selected row remains available");
    }

    private static async Task InspectionCorrelation(Action<bool, string> check)
    {
        var registry = new LyricInspectionRequests(); var song = SongOf("Inspection correlation"); var packet = Packet(song, Candidate(song, "qq", "probe"), false);
        string id = "";
        var pending = registry.Inspect(packet, (request, _) => id = request, CancellationToken.None);
        registry.Complete(id, "wrong song", new(true, true));
        check(!pending.IsCompleted && registry.PendingCount == 1, "inspection replies must match the original song key");
        registry.Complete(id, song.Key, new(false, true));
        check(await pending is { Usable: false, WordTimed: false } && registry.PendingCount == 0,
            "inspection correlation rejects impossible usable=false word=true results and releases completed requests");
        using var cancelled = new CancellationTokenSource(); var old = registry.Inspect(packet, (request, _) => id = request, cancelled.Token); var oldId = id;
        cancelled.Cancel();
        try { await old; throw new Exception("inspection did not cancel"); } catch (OperationCanceledException) { }
        var next = registry.Inspect(packet, (request, _) => id = request, CancellationToken.None);
        registry.Complete(oldId, song.Key, new(true, true));
        check(!next.IsCompleted && registry.PendingCount == 1, "a late cancelled inspection cannot complete another request for the same song");
        registry.Complete(id, song.Key, new(true, false)); await next;
        check(registry.PendingCount == 0, "cancelled and completed inspections retain no pending request records");
    }

    // Emulate provider latency to distinguish transport work from time spent waiting for a same-source download.
    private static async Task ProviderDownloadQueue(Action<bool, string> check)
    {
        var song = SongOf("Provider download queue");
        Configure(song, [Candidate(song, "qq", "line"), Candidate(song, "qq", "word", album: false), Candidate(song, "qq", "low", exact: false)], "qq:word");
        var active = 0; var overlapped = 0;
        TestProviders.FetchHandler = async (candidate, target, token) =>
        {
            if (Interlocked.Increment(ref active) > 1) Interlocked.Exchange(ref overlapped, 1);
            try { await Task.Delay(20, token); return Packet(target, candidate, candidate.Id == "word"); }
            finally { Interlocked.Decrement(ref active); }
        };
        using (var host = new MainWindow())
        {
            await host.Resolve(song).WaitAsync(Limit);
            check(overlapped == 0 && host.Status.SelectedKey == "qq:word",
                "same-source versions start their own download deadline only after the preceding download and inspection complete");
        }
        song = SongOf("Parallel source downloads");
        Configure(song, [Candidate(song, "kugou", "line"), Candidate(song, "netease", "word"), Candidate(song, "lrclib", "line")], "netease:word");
        active = 0; overlapped = 0;
        TestProviders.FetchHandler = async (candidate, target, token) =>
        {
            if (Interlocked.Increment(ref active) > 1) Interlocked.Exchange(ref overlapped, 1);
            try { await Task.Delay(20, token); return Packet(target, candidate, candidate.Id == "word"); }
            finally { Interlocked.Decrement(ref active); }
        };
        using var parallel = new MainWindow(); await parallel.Resolve(song).WaitAsync(Limit);
        check(overlapped == 1 && parallel.Status.SelectedKey == "netease:word", "different sources still inspect concurrently and consume results by matching score");
    }

    private static async Task CancelledInspectionCannotPublish(Action<bool, string> check)
    {
        var old = SongOf("Cancelled parser song"); var next = SongOf("Next parser song"); Configure(old, [Candidate(old, "qq", "word")], "qq:word");
        var local = Path.Combine(DataFiles.Root, "inspection-next.lrc"); File.WriteAllText(local, $"[ti:{next.Title}]\n[ar:{next.Artist}]\n[00:01.00]next local");
        DataFiles.Save("library.json", new LibraryState { Entries = [new(local, next.Title, next.Artist)] });
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var held = new TaskCompletionSource<LyricContentQuality>(TaskCreationOptions.RunContinuationsAsynchronously);
        TestProviders.InspectionHandler = _ => { entered.TrySetResult(); return held.Task; };
        using var host = new MainWindow(); var pending = host.Resolve(old);
        await entered.Task.WaitAsync(Limit); await host.Resolve(next).WaitAsync(Limit); await pending.WaitAsync(Limit);
        held.TrySetResult(new(true, true));
        var registry = (LyricInspectionRequests)typeof(MainWindow).GetField("lyricInspections", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(host)!;
        check(host.Packets.Single().Key == next.Key && host.Status.Key == next.Key && registry.PendingCount == 0,
            "changing songs during content inspection removes the old request and cannot publish or cache a late lyric");
    }
}
