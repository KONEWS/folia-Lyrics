// native/MediaMetadataCache.cs — refresh metadata without delaying an already identified song's transport clock.
namespace FoliaLyrics;
internal sealed class MediaMetadataCache<T>(TimeProvider? clock = null) where T : class
{
    private readonly TimeProvider clock = clock ?? TimeProvider.System;
    private nint session;
    private long generation, revision = long.MinValue;
    private DateTimeOffset retryAt = DateTimeOffset.MinValue;
    private CancellationTokenSource? request;
    private Task<T>? pending;
    private Exception? failure;
    public T? Value { get; private set; }

    // Known metadata returns immediately; a new event supersedes any older in-flight request.
    public Task<T> Read(nint identity, long metadataRevision, Func<CancellationToken, Task<T>> load, Func<bool> isCurrent, Action changed, CancellationToken token)
    {
        if (identity != session) { Clear(); session = identity; }
        if (failure is not null) return Task.FromException<T>(failure);
        if (revision != metadataRevision || pending is null || pending.IsCompleted && clock.GetUtcNow() >= retryAt)
        {
            request?.Cancel(); request?.Dispose(); request = new();
            revision = metadataRevision; retryAt = clock.GetUtcNow().AddMilliseconds(500);
            pending = Load(++generation, load, isCurrent, changed, request.Token);
            _ = Observe(pending);
        }
        return Value is { } value ? Task.FromResult(value) : pending.WaitAsync(token);
    }

    // Both generation and caller identity must still match after the potentially uncooperative OS request.
    private async Task<T> Load(long current, Func<CancellationToken, Task<T>> load, Func<bool> isCurrent, Action changed, CancellationToken token)
    {
        try
        {
            var next = await MediaReadDeadline.Read(load, token);
            if (current != generation || !isCurrent()) throw new OperationCanceledException();
            Value = next; changed(); return next;
        }
        catch (Exception error) when (current == generation && !token.IsCancellationRequested && isCurrent())
        {
            failure = error; changed(); throw;
        }
    }
    private static async Task Observe(Task<T> task) { try { await task; } catch { /* Read surfaces current failures; superseded requests cannot publish. */ } }
    public void Clear()
    {
        generation++; request?.Cancel(); request?.Dispose(); request = null; session = 0; revision = long.MinValue;
        pending = null; failure = null; Value = null; retryAt = DateTimeOffset.MinValue;
    }
}
