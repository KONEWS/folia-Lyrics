// native/Online/OnlineAutomaticSelection.cs: QQ word timing takes priority; downloaded content decides availability and timing.
namespace FoliaLyrics;
internal sealed partial class OnlineLyrics
{
    internal TimeSpan AutomaticSearchTimeout { get; set; } = TimeSpan.FromSeconds(15);
    private readonly record struct InspectedCandidate(LyricCandidate Candidate, Lyrics Lyrics, LyricContentQuality Quality);

    // Search results remain complete for ranking; the chooser's row limit must not hide a better word-timed version.
    // A complete QQ page can establish its best word lyric early; other sources still finish for the chooser and fallback ranking.
    internal async Task<AutomaticLyricsResult> ResolveAutomatic(Song song, string[] enabled, CancellationToken token,
        Func<Lyrics, CancellationToken, Task<LyricContentQuality>> inspect, Func<AutomaticLyricsResult, Task>? selectedEarly = null)
    {
        var work = CancellationTokenSource.CreateLinkedTokenSource(token);
        var query = LyricQuery.From(song); Task<SearchPage>? qqSearch = null;
        var pages = StartSearch(query, enabled, work.Token, AutomaticSearchTimeout,
            (provider, page) => { if (provider == "qq") qqSearch = page; });
        var errors = new List<string>();
        var checkedCandidates = new Dictionary<string, LyricCandidate>();
        InspectedCandidate? qqFallback = null, otherFallback = null;

        // Different sources can run together; same-source versions run in order so transport queueing cannot consume their download deadlines.
        async Task<InspectedCandidate?> FirstWord(IEnumerable<LyricCandidate> source, bool qq)
        {
            var ranked = source.Where(candidate => candidate.Available).OrderByDescending(candidate => candidate.Score)
                .ThenBy(candidate => Array.IndexOf(ProviderIds, candidate.Provider)).ToArray();
            foreach (var batch in ranked.Chunk(3))
            {
                using var batchWork = CancellationTokenSource.CreateLinkedTokenSource(token);
                var preceding = new Dictionary<string, Task>();
                var attempts = batch.Select(candidate =>
                {
                    preceding.TryGetValue(candidate.Provider, out var previous);
                    var attempt = InspectAfter(previous, candidate, batchWork.Token);
                    preceding[candidate.Provider] = attempt;
                    return attempt;
                }).ToArray();
                try
                {
                    for (var index = 0; index < attempts.Length; index++)
                    {
                        token.ThrowIfCancellationRequested();
                        try
                        {
                            var result = await attempts[index].WaitAsync(token);
                            if (result is null) continue;
                            checkedCandidates[result.Value.Candidate.Key] = result.Value.Candidate with { Quality = result.Value.Quality.WordTimed ? "逐字" : "逐行" };
                            if (qq) qqFallback ??= result; else otherFallback ??= result;
                            if (result.Value.Quality.WordTimed) return result;
                        }
                        catch (OperationCanceledException) when (token.IsCancellationRequested) { throw; }
                        catch (Exception error) { errors.Add(batch[index].Provider + "：" + error.Message); }
                    }
                }
                finally
                {
                    batchWork.Cancel();
                    foreach (var attempt in attempts) _ = attempt.ContinueWith(completed => { _ = completed.Exception; }, CancellationToken.None,
                        TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
                }
            }
            return null;
        }

        async Task<InspectedCandidate?> InspectAfter(Task? previous, LyricCandidate candidate, CancellationToken workToken)
        {
            if (previous is not null)
            {
                try { await previous.WaitAsync(workToken); }
                catch (OperationCanceledException) when (workToken.IsCancellationRequested) { throw; }
                catch { } // A failed higher-ranked version must not prevent inspecting the next one.
            }
            workToken.ThrowIfCancellationRequested();
            return await InspectCandidate(candidate, song, workToken, inspect);
        }

        // Keep the selected row inside the display limit without excluding any candidate from the decision.
        AutomaticLyricsResult Result(OnlineSearchResult search, InspectedCandidate? selected)
        {
            var rows = OrderCandidates(search.Candidates.Select(candidate => checkedCandidates.GetValueOrDefault(candidate.Key, candidate))).Take(40).ToArray();
            if (selected is { } winner && !rows.Any(candidate => candidate.Key == winner.Candidate.Key))
                rows = OrderCandidates(rows.Take(39).Append(checkedCandidates.GetValueOrDefault(winner.Candidate.Key, winner.Candidate))).ToArray();
            return new(selected?.Lyrics, selected?.Candidate, rows, search.Errors.Concat(errors).ToArray());
        }

        try
        {
            InspectedCandidate? selected = null;
            if (qqSearch is not null)
            {
                var preferred = await qqSearch.WaitAsync(token);
                var ranked = preferred.Candidates.Select(candidate => Rank(candidate, query)).DistinctBy(candidate => candidate.Key);
                selected = await FirstWord(ranked, true);
                if (selected is not null && selectedEarly is not null)
                {
                    token.ThrowIfCancellationRequested();
                    var completed = MergePages(pages.Where(page => page.IsCompletedSuccessfully).Select(page => page.Result), query, int.MaxValue);
                    await selectedEarly(Result(completed, selected)).WaitAsync(token);
                }
            }
            var search = await Complete(pages, query, token, int.MaxValue);
            selected ??= await FirstWord(search.Candidates.Where(candidate => candidate.Provider != "qq"), false)
                ?? qqFallback ?? otherFallback;
            token.ThrowIfCancellationRequested();
            return Result(search, selected);
        }
        finally { CancelAndObserve(work, pages); }
    }

    // Provider promises and parser responses have separate deadlines; even a transport that ignores cancellation cannot hold song changes.
    private async Task<InspectedCandidate?> InspectCandidate(LyricCandidate candidate, Song song, CancellationToken token,
        Func<Lyrics, CancellationToken, Task<LyricContentQuality>> inspect)
    {
        Lyrics? packet;
        using (var download = CancellationTokenSource.CreateLinkedTokenSource(token))
        {
            download.CancelAfter(TimeSpan.FromSeconds(2));
            var fetched = Fetch(candidate, song, download.Token);
            try { packet = await fetched.WaitAsync(download.Token); }
            catch (OperationCanceledException) when (!token.IsCancellationRequested) { throw new TimeoutException("歌词获取超时"); }
            finally { _ = fetched.ContinueWith(completed => { _ = completed.Exception; }, CancellationToken.None,
                TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default); }
        }
        if (packet is null) return null;
        var quality = await inspect(packet, token).WaitAsync(TimeSpan.FromSeconds(5), token);
        token.ThrowIfCancellationRequested();
        return quality.Usable ? new(candidate, packet, quality) : null;
    }
}
