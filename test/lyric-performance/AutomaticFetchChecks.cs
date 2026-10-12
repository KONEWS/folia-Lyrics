using FoliaLyrics;

// test/lyric-performance/AutomaticFetchChecks.cs — exercise download fallback through the real automatic resolver.
internal static class AutomaticFetchChecks
{
    public static async Task Run(Action<bool, string> check)
    {
        DataFiles.Reset();
        var song = new Song("download-fallback", "DownloadFallback", "Test", "", "", false, 0, 180, 1, true, [], "Album");
        var held = new TaskCompletionSource<Lyrics?>(TaskCreationOptions.RunContinuationsAsynchronously);
        CancellationToken preferredToken = default;
        TestProviders.SearchHandler = (query, sources, _) => Task.FromResult(new OnlineSearchResult(
            [new(sources.Single(), "download", query.Title, query.Artist, query.Album, query.Duration, "timed")], []));
        TestProviders.FetchHandler = (candidate, target, token) =>
        {
            if (candidate.Provider == "qq") { preferredToken = token; return held.Task; }
            return Task.FromResult<Lyrics?>(new(target.Key, target.Title, target.Artist, "[00:01.00]fallback", candidate.Provider, "", false));
        };
        using var host = new MainWindow();
        try
        {
            await host.Resolve(song).WaitAsync(TimeSpan.FromSeconds(6));
            check(preferredToken.IsCancellationRequested && !held.Task.IsCompleted && host.Packets.Single().Source == "kugou",
                "a preferred download that ignores cancellation cannot block the next reliable lyric source");
            check(host.Status.Errors.Any(error => error.Contains("qq") && error.Contains("超时")),
                "automatic download timeout remains visible in the completed source errors");
        }
        finally { held.TrySetResult(new(song.Key, song.Title, song.Artist, "[00:01.00]late", "qq", "", false)); }
        check(host.Packets.Single().Source == "kugou", "a timed-out download cannot publish over the accepted fallback");
        var cached = await new OnlineCache(Path.Combine(DataFiles.Root, "online-lyrics")).ReadAsync(song);
        check(cached?.Lyrics.Source == "kugou", "the accepted download fallback is retained for the next playback");
    }
}
