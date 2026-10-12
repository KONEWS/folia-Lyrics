using System.Text;
using System.Text.RegularExpressions;

// native/Online/OnlineLyrics.cs: Explicit cross-provider facade; UI never sees raw service responses.
namespace FoliaLyrics;
internal sealed class OnlineLyrics : IDisposable
{
    private readonly OnlineHttp? http;
    private readonly IOnlineLyricProvider[] providers;
    private readonly TimeSpan priorityWindow = TimeSpan.FromMilliseconds(750);
    public static readonly string[] ProviderIds = ["qq", "kugou", "netease", "lrclib"];
    internal const int PriorityPolicyVersion = 1;
    // Provider text is untrusted and can reach 4 MB: bounded patterns plus a match timeout keep a hostile response from monopolizing a worker.
    private static readonly TimeSpan MatchTimeout = TimeSpan.FromMilliseconds(250);
    // A synchronized-lyric tag such as [mm:ss.xx] (LRC/KRC) or [start,duration] (YRC); only the text after the numbers is capped, so ordinary tags match as before.
    private static readonly Regex TimestampTag = new(@"\[(?>\d+)[:,](?>\d+)[^\]\r\n]{0,64}\]", RegexOptions.None, MatchTimeout);
    private static readonly Regex HexPayload = new("^[0-9a-fA-F]+$", RegexOptions.None, MatchTimeout);
    public OnlineLyrics(OnlineHttp? transport = null)
    { http = transport ?? new(); providers = [new QqLyricProvider(http), new KugouLyricProvider(http), new NeteaseLyricProvider(http), new LrclibLyricProvider(http)]; }
    internal OnlineLyrics(IOnlineLyricProvider[] providers, TimeSpan priorityWindow)
    {
        if (priorityWindow < TimeSpan.Zero || priorityWindow.TotalMilliseconds > uint.MaxValue - 1) throw new ArgumentOutOfRangeException(nameof(priorityWindow));
        this.providers = providers.ToArray(); this.priorityWindow = priorityWindow;
    }
    public async Task<OnlineSearchResult> Search(LyricQuery query, string[] enabled, CancellationToken token)
    {
        var work = CancellationTokenSource.CreateLinkedTokenSource(token);
        var pages = StartSearch(query, enabled, work.Token);
        try { return await Complete(pages, query, token); }
        finally { CancelAndObserve(work, pages); }
    }
    // Search all enabled sources together, but prefer QQ for automatic matches as each page is ready.
    // Give preferred sources one shared grace window, then try ready pages in priority order without changing an accepted match.
    public async Task<OnlineSearchResult> SearchProgressive(LyricQuery query, string[] enabled, CancellationToken token, Func<LyricCandidate[], Task<bool>> tryPage)
    {
        var work = CancellationTokenSource.CreateLinkedTokenSource(token);
        var pages = StartSearch(query, enabled, work.Token);
        using var clock = CancellationTokenSource.CreateLinkedTokenSource(token);
        var deadline = Task.Delay(priorityWindow, clock.Token);
        Task<bool>? attempt = null;
        try
        {
            var remaining = pages.ToList();
            while (remaining.Count > 0)
            {
                token.ThrowIfCancellationRequested();
                var preferred = remaining[0];
                if (!preferred.IsCompleted && !deadline.IsCompleted) await Task.WhenAny(preferred, deadline).WaitAsync(token);
                var ready = remaining.FirstOrDefault(page => page.IsCompleted);
                if (ready is null)
                {
                    await Task.WhenAny(remaining).WaitAsync(token);
                    ready = remaining.First(page => page.IsCompleted);
                }
                var page = await ready.WaitAsync(token); token.ThrowIfCancellationRequested();
                remaining.Remove(ready);
                var ranked = page.Candidates.Select(c => Rank(c, query)).DistinctBy(c => c.Key).OrderByDescending(c => c.Score).ToArray();
                attempt = tryPage(ranked);
                if (await attempt.WaitAsync(token)) break;
            }
            clock.Cancel();
            return await Complete(pages, query, token);
        }
        finally
        {
            clock.Cancel(); CancelAndObserve(work, pages);
            if (attempt is not null) _ = attempt.ContinueWith(completed => { _ = completed.Exception; }, CancellationToken.None,
                TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
        }
    }
    // Cancellation must return promptly even if a provider ignores it; observe every eventual result and release its token source afterwards.
    private static void CancelAndObserve(CancellationTokenSource work, Task<SearchPage>[] pages)
    {
        if (pages.Any(page => !page.IsCompleted)) work.Cancel();
        _ = Task.WhenAll(pages).ContinueWith(completed => { _ = completed.Exception; work.Dispose(); }, CancellationToken.None,
            TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
    }
    private readonly record struct SearchPage(LyricCandidate[] Candidates, string Error);
    private Task<SearchPage>[] StartSearch(LyricQuery query, string[] enabled, CancellationToken token) => providers
        .Where(p => enabled.Contains(p.Id)).OrderBy(p => Array.IndexOf(ProviderIds, p.Id)).Select(async p =>
        {
            try { return new SearchPage(await Task.Run(() => p.Search(query, token), token).ConfigureAwait(false), ""); }
            catch (OperationCanceledException) when (token.IsCancellationRequested) { throw; }
            catch (Exception e) { return new SearchPage([], $"{p.Name}：{(e is OperationCanceledException ? "请求超时" : e.Message)}"); }
        }).ToArray();
    private static async Task<OnlineSearchResult> Complete(Task<SearchPage>[] work, LyricQuery query, CancellationToken token)
    {
        var pages = await Task.WhenAll(work).WaitAsync(token);
        token.ThrowIfCancellationRequested();
        var candidates = OrderCandidates(pages.SelectMany(p => p.Candidates).Select(c => Rank(c, query)).DistinctBy(c => c.Key)).Take(40).ToArray();
        return new(candidates, pages.Where(p => p.Error.Length > 0).Select(p => p.Error).ToArray());
    }
    // Keep the requested source preference in the chooser; score still ranks versions within each source without changing eligibility.
    internal static IOrderedEnumerable<LyricCandidate> OrderCandidates(IEnumerable<LyricCandidate> candidates) => candidates
        .OrderBy(c => Array.IndexOf(ProviderIds, c.Provider)).ThenByDescending(c => c.Score);
    public Task<Lyrics?> Fetch(LyricCandidate candidate, Song song, CancellationToken token) => Task.Run(async () =>
    {
        var provider = providers.First(p => p.Id == candidate.Provider);
        // Provider decoding and response parsing may be substantial; keep them off the host's UI context.
        var result = await provider.Fetch(candidate, song, token).ConfigureAwait(false); token.ThrowIfCancellationRequested();
        if (result is null) return null;
        try
        {
            if (result.Format == "qq-qrc") return result.Content.Length > 16 && HexPayload.IsMatch(result.Content) ? result : null;
            if (!TimestampTag.IsMatch(result.Content)) return null;
        }
        catch (RegexMatchTimeoutException) { return null; } // A response that cannot be validated in time is treated as "not a lyric".
        return result;
    }, token);
    public static string Normalize(string value) => Regex.Replace(value.Normalize(NormalizationForm.FormKC).ToLowerInvariant(), @"[^\p{L}\p{N}]", "");
    internal static LyricCandidate Rank(LyricCandidate c, LyricQuery q)
    {
        var title = Normalize(q.Title); var artist = Normalize(q.Artist); var album = Normalize(q.Album);
        var titleMatch = title.Length > 0 && title == Normalize(c.Title);
        var artistMatch = artist.Length > 0 && artist == Normalize(c.Artist);
        var albumMatch = album.Length > 0 && album == Normalize(c.Album);
        var durationMatch = q.Duration > 0 && c.Duration > 0 && Math.Abs(c.Duration - q.Duration) <= 2;
        var eligible = titleMatch && artistMatch && c.Available && (durationMatch || q.Duration <= 0 && albumMatch);
        var score = (titleMatch ? 45 : 0) + (artistMatch ? 30 : 0) + (durationMatch ? 15 : 0) + (albumMatch ? 8 : 0) + (c.Available ? 2 : 0);
        return c with { Score = score, AutoEligible = eligible };
    }
    public void Dispose() => http?.Dispose();
}
