// native/MediaCoverCache.cs — retain one selected session's artwork and retry delayed or failed reads.
namespace FoliaLyrics;
internal sealed class MediaCoverCache(TimeProvider? clock = null)
{
    private readonly TimeProvider clock = clock ?? TimeProvider.System;
    private nint session;
    private string song = "";
    private long generation, metadataRevision = long.MinValue;
    private DateTimeOffset retryAt = DateTimeOffset.MinValue;
    public string Value { get; private set; } = "";

    // Metadata events bypass the timer; periodic retries also handle players that omit artwork events.
    public async Task<string> Read(nint sessionIdentity, string songKey, long revision, Func<Task<string>> load, Func<bool> isCurrent)
    {
        if (session != sessionIdentity || song != songKey)
        {
            Clear(); session = sessionIdentity; song = songKey;
        }
        if (metadataRevision == revision && clock.GetUtcNow() < retryAt) return Value;
        metadataRevision = revision;
        retryAt = clock.GetUtcNow().AddSeconds(2);
        var pendingGeneration = generation;
        var next = await load();
        if (pendingGeneration != generation || !isCurrent()) throw new OperationCanceledException();
        if (next.Length > 0) Value = next;
        retryAt = clock.GetUtcNow().AddSeconds(next.Length > 0 ? 30 : 2);
        return Value;
    }

    public void Clear()
    {
        generation++; session = 0; song = ""; Value = "";
        metadataRevision = long.MinValue; retryAt = DateTimeOffset.MinValue;
    }
}
