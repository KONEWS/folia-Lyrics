// native/MediaMetadataCache.cs — refresh metadata without delaying an already identified song's transport clock.
namespace FoliaLyrics;
internal sealed class MediaMetadataCache<T>(TimeProvider? clock = null, Func<T, T, bool>? same = null) where T : class
{
    private readonly TimeProvider clock = clock ?? TimeProvider.System;
    private readonly Func<T, T, bool> same = same ?? EqualityComparer<T>.Default.Equals;
    private nint session;
    private long generation, revision = long.MinValue;
    private DateTimeOffset retryAt = DateTimeOffset.MinValue;
    private CancellationTokenSource? request;
    private Task<T>? pending;
    private Exception? failure;
    public T? Value { get; private set; }
    public long ValueRevision { get; private set; } = long.MinValue;

    // Known metadata returns immediately; a new event supersedes any older in-flight request.
    public Task<T> Read(nint identity, long metadataRevision, Func<CancellationToken, Task<T>> load, Func<bool> isCurrent, Action changed, CancellationToken token)
    {
        if (identity != session) { Clear(); session = identity; }
        if (failure is not null) return Task.FromException<T>(failure);
        if (revision != metadataRevision || pending is null || pending.IsCompleted && clock.GetUtcNow() >= retryAt)
        {
            request?.Cancel(); request?.Dispose(); request = new();
            revision = metadataRevision; retryAt = clock.GetUtcNow().AddMilliseconds(500);
            pending = Load(++generation, metadataRevision, load, isCurrent, changed, request.Token);
            _ = Observe(pending);
        }
        return Value is { } value ? Task.FromResult(value) : pending.WaitAsync(token);
    }

    // Both generation and caller identity must still match after the potentially uncooperative OS request.
    private async Task<T> Load(long current, long metadataRevision, Func<CancellationToken, Task<T>> load, Func<bool> isCurrent, Action changed, CancellationToken token)
    {
        try
        {
            var next = await MediaReadDeadline.Read(load, token);
            if (current != generation || !isCurrent()) throw new OperationCanceledException();
            // Periodic reads still replace native properties, but only real changes or metadata events wake another poll.
            var notify = Value is null || ValueRevision != metadataRevision || !same(Value, next);
            Value = next; ValueRevision = metadataRevision;
            if (notify) changed();
            return next;
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
        pending = null; failure = null; Value = null; ValueRevision = long.MinValue; retryAt = DateTimeOffset.MinValue;
    }
}
