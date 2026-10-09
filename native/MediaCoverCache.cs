// native/MediaCoverCache.cs — retain one selected session's artwork and retry delayed or failed reads.
namespace FoliaLyrics;
internal sealed class MediaCoverCache(TimeProvider? clock = null)
{
    private readonly TimeProvider clock = clock ?? TimeProvider.System;
    private nint session;
    private string song = "";
    private long generation, metadataRevision = long.MinValue;
    private DateTimeOffset retryAt = DateTimeOffset.MinValue;
    private Task<string>? pending;
    private Task<string>? observed;
    public string Value { get; private set; } = "";

    // Keep song/clock polling responsive while artwork loads; completion is presented by the next poll.
    public string Refresh(nint sessionIdentity, string songKey, long revision, Func<Task<string>> load, Func<bool> isCurrent, Action<Exception> log)
    {
        var refresh = Read(sessionIdentity, songKey, revision, load, isCurrent);
        if (!refresh.IsCompletedSuccessfully && !ReferenceEquals(refresh, observed))
        {
            observed = refresh;
            _ = Observe(refresh, log);
        }
        return Value;
    }

    // Metadata events bypass the timer; periodic retries also handle players that omit artwork events.
    public Task<string> Read(nint sessionIdentity, string songKey, long revision, Func<Task<string>> load, Func<bool> isCurrent)
    {
        if (session != sessionIdentity || song != songKey)
        {
            Clear(); session = sessionIdentity; song = songKey;
        }
        if (metadataRevision == revision)
        {
            if (pending is { IsCompleted: false }) return pending;
            if (clock.GetUtcNow() < retryAt) return Task.FromResult(Value);
        }
        metadataRevision = revision;
        retryAt = clock.GetUtcNow().AddSeconds(2);
        pending = Load(++generation, load, isCurrent);
        return pending;
    }

    // Every newer request supersedes old artwork, including two events for the same song.
    private async Task<string> Load(long pendingGeneration, Func<Task<string>> load, Func<bool> isCurrent)
    {
        var next = await load();
        if (pendingGeneration != generation || !isCurrent()) throw new OperationCanceledException();
        if (next.Length > 0) Value = next;
        retryAt = clock.GetUtcNow().AddSeconds(next.Length > 0 ? 30 : 2);
        return Value;
    }

    private static async Task Observe(Task<string> task, Action<Exception> log)
    {
        try { await task; }
        catch (OperationCanceledException) { }
        catch (Exception error) { log(error); }
    }

    public void Clear()
    {
        generation++; session = 0; song = ""; Value = "";
        pending = null; observed = null;
        metadataRevision = long.MinValue; retryAt = DateTimeOffset.MinValue;
    }
}
