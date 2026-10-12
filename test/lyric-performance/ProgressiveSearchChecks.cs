using System.Collections.Concurrent;
using FoliaLyrics;

// test/lyric-performance/ProgressiveSearchChecks.cs: Exercise bounded provider priority and cancellation entirely with offline provider doubles.
internal static class ProgressiveSearchChecks
{
    private static readonly TimeSpan Limit = TimeSpan.FromSeconds(3);
    private static readonly LyricQuery Query = new("Priority", "Test", "Album", 180);
    private static TaskCompletionSource Signal() => new(TaskCreationOptions.RunContinuationsAsynchronously);
    private static LyricCandidate Candidate(string provider, string id = "match", double duration = 180, string album = "Album")
        => new(provider, id, Query.Title, Query.Artist, album, duration, "timed");
    private static Provider Ready(string id, params LyricCandidate[] candidates) => new(id, _ => Task.FromResult(candidates));

    public static async Task Run(Action<bool, string> check)
    {
        await PreferredWithinWindow(check);
        await SlowPreferredFallback(check);
        await RejectedPageFallsThrough(check);
        await IneligiblePageRemainsStrict(check);
        await CanceledSearchReturnsPromptly(check);
        await CanceledCallbackReturnsPromptly(check);
        await FailedCallbackCancelsSearch(check);
        await ManualSearchWaitsForAllPages(check);
        await CandidateGroupsPreferQq(check);
        using var empty = new OnlineLyrics([Ready("kugou", Candidate("kugou"))], TimeSpan.Zero);
        var callbacks = 0;
        var result = await empty.SearchProgressive(Query, [], CancellationToken.None, _ => { callbacks++; return Task.FromResult(false); });
        check(callbacks == 0 && result.Candidates.Length == 0 && result.Errors.Length == 0,
            "progressive search with no enabled providers remains empty without invoking a callback");
    }

    // Hold the preferred source explicitly, then release it before the injected grace window can expire.
    private static async Task PreferredWithinWindow(Action<bool, string> check)
    {
        var preferredGate = Signal(); var lowerReady = Signal(); var calls = new ConcurrentQueue<string>();
        using var facade = new OnlineLyrics([
            new Provider("qq", async _ => { await preferredGate.Task; return [Candidate("qq")]; }),
            new Provider("kugou", _ => { lowerReady.TrySetResult(); return Task.FromResult(new[] { Candidate("kugou") }); })
        ], TimeSpan.FromMinutes(1));
        var pending = facade.SearchProgressive(Query, ["kugou", "qq"], CancellationToken.None,
            page => { calls.Enqueue(page.Single().Provider); return Task.FromResult(true); });
        try
        {
            await lowerReady.Task.WaitAsync(Limit);
            check(calls.IsEmpty, "a prepared lower-priority page waits inside the shared preferred-source grace window");
        }
        finally { preferredGate.TrySetResult(); }
        var result = await pending.WaitAsync(Limit);
        check(calls.SequenceEqual(["qq"]) && result.Candidates.Length == 2,
            "a preferred source that finishes within the grace window wins and retains all search results");
    }

    // A late preferred source must enrich the completed candidate list without replacing the accepted fallback lyrics.
    private static async Task SlowPreferredFallback(Action<bool, string> check)
    {
        var preferredGate = Signal(); var accepted = Signal(); var lowerReady = Signal(); var calls = new ConcurrentQueue<string>();
        using var facade = new OnlineLyrics([
            new Provider("qq", async _ => { await preferredGate.Task; return [Candidate("qq")]; }),
            new Provider("kugou", _ => { lowerReady.TrySetResult(); return Task.FromResult(new[] { Candidate("kugou") }); }),
            new Provider("netease", _ => Task.FromException<LyricCandidate[]>(new IOException("offline provider failure"))),
            new Provider("lrclib", async _ => { await accepted.Task; return [Candidate("lrclib", "low-score", album: ""), Candidate("lrclib", "wrong-duration", 183)]; })
        ], TimeSpan.FromMilliseconds(40));
        var pending = facade.SearchProgressive(Query, OnlineLyrics.ProviderIds, CancellationToken.None, page =>
        {
            if (page.Length > 0) calls.Enqueue(page[0].Provider);
            var eligible = page.Any(candidate => candidate.AutoEligible);
            if (eligible) accepted.TrySetResult();
            return Task.FromResult(eligible);
        });
        try
        {
            await lowerReady.Task.WaitAsync(Limit); await accepted.Task.WaitAsync(Limit);
            check(!pending.IsCompleted && calls.SequenceEqual(["kugou"]),
                "a held preferred source no longer blocks a ready strict match after the shared grace window");
        }
        finally { preferredGate.TrySetResult(); accepted.TrySetResult(); }
        var result = await pending.WaitAsync(Limit);
        check(calls.SequenceEqual(["kugou"]), "late preferred results cannot invoke another automatic selection after fallback acceptance");
        check(result.Candidates.Select(candidate => candidate.Key).SequenceEqual(new[] { "qq:match", "kugou:match", "lrclib:low-score", "lrclib:wrong-duration" })
            && result.Errors.Single() == "netease：offline provider failure",
            "bounded priority retains every successful page, provider error, score order and source tie-break");
        check(!result.Candidates.Single(candidate => candidate.Id == "wrong-duration").AutoEligible,
            "complete results keep strict duration eligibility after using a faster source");
    }

    private static async Task RejectedPageFallsThrough(Action<bool, string> check)
    {
        var preferredGate = Signal(); var accepted = Signal(); var qqAttempted = Signal(); var calls = new ConcurrentQueue<string>();
        using var facade = new OnlineLyrics([
            new Provider("qq", async _ => { await preferredGate.Task; return [Candidate("qq")]; }),
            Ready("kugou", Candidate("kugou")), new Provider("netease", async _ => { await qqAttempted.Task; return [Candidate("netease")]; })
        ], TimeSpan.Zero);
        var pending = facade.SearchProgressive(Query, OnlineLyrics.ProviderIds, CancellationToken.None, page =>
        {
            var provider = page.Single().Provider; calls.Enqueue(provider);
            if (provider == "kugou") qqAttempted.TrySetResult();
            if (provider == "netease") accepted.TrySetResult();
            return Task.FromResult(provider == "netease");
        });
        try
        {
            await accepted.Task.WaitAsync(Limit);
            check(calls.SequenceEqual(["kugou", "netease"]),
                "after the grace window a rejected ready page falls through without returning to a held preferred source");
        }
        finally { preferredGate.TrySetResult(); qqAttempted.TrySetResult(); }
        await pending.WaitAsync(Limit);
    }

    private static async Task IneligiblePageRemainsStrict(Action<bool, string> check)
    {
        var calls = new List<string>();
        using var facade = new OnlineLyrics([
            Ready("qq", Candidate("qq", duration: 183)), Ready("kugou", Candidate("kugou"))
        ], TimeSpan.FromMinutes(1));
        await facade.SearchProgressive(Query, OnlineLyrics.ProviderIds, CancellationToken.None, page =>
        {
            calls.Add(page.Single().Provider); return Task.FromResult(page.Any(candidate => candidate.AutoEligible));
        }).WaitAsync(Limit);
        check(calls.SequenceEqual(["qq", "kugou"]),
            "an ineligible preferred page still reaches the next source immediately without weakening strict matching");
    }

    // The provider intentionally ignores cancellation so the facade's prompt return does not depend on adapter cooperation.
    private static async Task CanceledSearchReturnsPromptly(Action<bool, string> check)
    {
        var gate = Signal(); var entered = Signal(); var canceled = Signal(); var exited = Signal(); var callbacks = 0;
        using var cancellation = new CancellationTokenSource();
        using var facade = new OnlineLyrics([new Provider("qq", async token =>
        {
            using var registration = token.Register(() => canceled.TrySetResult()); entered.TrySetResult();
            try { await gate.Task; throw new IOException("late ignored provider failure"); }
            finally { exited.TrySetResult(); }
        })], TimeSpan.FromMinutes(1));
        var pending = facade.SearchProgressive(Query, ["qq"], cancellation.Token, _ => { callbacks++; return Task.FromResult(true); });
        try
        {
            await entered.Task.WaitAsync(Limit); cancellation.Cancel();
            try { await pending.WaitAsync(Limit); throw new Exception("Canceled progressive search returned a result"); }
            catch (OperationCanceledException) { }
            await canceled.Task.WaitAsync(Limit);
            check(callbacks == 0 && !exited.Task.IsCompleted, "canceling an obsolete search returns before a noncooperative provider and cancels its child token");
        }
        finally { gate.TrySetResult(); }
        await exited.Task.WaitAsync(Limit);
        check(callbacks == 0, "a late failing canceled provider never invokes the page callback");
    }

    private static async Task FailedCallbackCancelsSearch(Action<bool, string> check)
    {
        var gate = Signal(); var entered = Signal(); var canceled = Signal(); var exited = Signal();
        using var facade = new OnlineLyrics([
            new Provider("qq", async _ => { await entered.Task; return [Candidate("qq")]; }),
            new Provider("kugou", async token =>
            {
                using var registration = token.Register(() => canceled.TrySetResult()); entered.TrySetResult();
                try { await gate.Task; throw new IOException("late ignored provider failure"); }
                finally { exited.TrySetResult(); }
            })
        ], TimeSpan.FromMinutes(1));
        var pending = facade.SearchProgressive(Query, OnlineLyrics.ProviderIds, CancellationToken.None,
            _ => Task.FromException<bool>(new InvalidOperationException("offline callback failure")));
        try
        {
            try { await pending.WaitAsync(Limit); throw new Exception("Callback failure was hidden"); }
            catch (InvalidOperationException error) when (error.Message == "offline callback failure") { }
            await canceled.Task.WaitAsync(Limit);
            check(!exited.Task.IsCompleted, "a page callback failure cancels and observes unfinished searches without waiting for them");
        }
        finally { gate.TrySetResult(); }
        await exited.Task.WaitAsync(Limit);
    }

    private static async Task CanceledCallbackReturnsPromptly(Action<bool, string> check)
    {
        var gate = Signal(); var entered = Signal(); var exited = Signal();
        using var cancellation = new CancellationTokenSource();
        using var facade = new OnlineLyrics([Ready("kugou", Candidate("kugou"))], TimeSpan.Zero);
        var pending = facade.SearchProgressive(Query, ["kugou"], cancellation.Token, async _ =>
        {
            entered.TrySetResult();
            try { await gate.Task; throw new IOException("late ignored callback failure"); }
            finally { exited.TrySetResult(); }
        });
        try
        {
            await entered.Task.WaitAsync(Limit); cancellation.Cancel();
            try { await pending.WaitAsync(Limit); throw new Exception("Canceled callback returned a result"); }
            catch (OperationCanceledException) { }
            check(!exited.Task.IsCompleted, "canceling obsolete work returns before an uncooperative page callback and observes its eventual failure");
        }
        finally { gate.TrySetResult(); }
        await exited.Task.WaitAsync(Limit);
    }

    private static async Task ManualSearchWaitsForAllPages(Action<bool, string> check)
    {
        var gate = Signal(); var ready = Signal();
        using var facade = new OnlineLyrics([
            new Provider("qq", async _ => { await gate.Task; return [Candidate("qq")]; }),
            new Provider("kugou", _ => { ready.TrySetResult(); return Task.FromResult(new[] { Candidate("kugou") }); })
        ], TimeSpan.Zero);
        var pending = facade.Search(Query, OnlineLyrics.ProviderIds, CancellationToken.None);
        try { await ready.Task.WaitAsync(Limit); check(!pending.IsCompleted, "manual search continues waiting for the complete candidate set"); }
        finally { gate.TrySetResult(); }
        var result = await pending.WaitAsync(Limit);
        check(result.Candidates.Select(candidate => candidate.Provider).SequenceEqual(["qq", "kugou"]),
            "manual search retains stable source ordering independently of the automatic grace window");
    }

    private static async Task CandidateGroupsPreferQq(Action<bool, string> check)
    {
        using var facade = new OnlineLyrics([
            Ready("kugou", Candidate("kugou", "highest-score")),
            Ready("qq", Candidate("qq", "wrong-duration", duration: 183), Candidate("qq", "lower-score", album: ""), Candidate("qq", "highest-score"))
        ], TimeSpan.Zero);
        var result = await facade.Search(Query, ["kugou", "qq"], CancellationToken.None);
        check(result.Candidates.Select(candidate => candidate.Key).SequenceEqual(["qq:highest-score", "qq:lower-score", "qq:wrong-duration", "kugou:highest-score"]),
            "QQ candidates precede higher-scoring other sources while versions within QQ retain score order");
        check(result.Candidates.Where(candidate => candidate.AutoEligible).Select(candidate => candidate.Key).SequenceEqual(["qq:highest-score", "qq:lower-score", "kugou:highest-score"]),
            "QQ candidate grouping never makes an incorrect-duration version automatically eligible");
        var withoutQq = await facade.Search(Query, ["kugou"], CancellationToken.None);
        check(withoutQq.Candidates.Single().Provider == "kugou", "disabling QQ leaves the remaining provider available without synthetic QQ rows");
    }

    private sealed class Provider(string id, Func<CancellationToken, Task<LyricCandidate[]>> search) : IOnlineLyricProvider
    {
        public string Id => id;
        public string Name => id;
        public Task<LyricCandidate[]> Search(LyricQuery query, CancellationToken token) => search(token);
        public Task<Lyrics?> Fetch(LyricCandidate candidate, Song song, CancellationToken token) => throw new InvalidOperationException("Unexpected fetch in search-only checks");
    }
}
