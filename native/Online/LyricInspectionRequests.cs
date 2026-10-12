using System.Collections.Concurrent;

// native/Online/LyricInspectionRequests.cs: Correlate content inspection replies without retaining cancelled songs.
namespace FoliaLyrics;
internal sealed class LyricInspectionRequests
{
    private readonly ConcurrentDictionary<string, (string Key, TaskCompletionSource<LyricContentQuality> Completion)> pending = new();
    internal int PendingCount => pending.Count;

    // A page reload, song change or late parser response cannot complete a different request.
    internal async Task<LyricContentQuality> Inspect(Lyrics packet, Action<string, Lyrics> send, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        var id = Guid.NewGuid().ToString("N");
        var completion = new TaskCompletionSource<LyricContentQuality>(TaskCreationOptions.RunContinuationsAsynchronously);
        pending[id] = (packet.Key, completion);
        try
        {
            send(id, packet);
            return await completion.Task.WaitAsync(TimeSpan.FromSeconds(5), token);
        }
        finally { pending.TryRemove(id, out _); }
    }

    internal void Complete(string id, string key, LyricContentQuality quality)
    {
        if (pending.TryGetValue(id, out var request) && request.Key == key)
            request.Completion.TrySetResult(quality with { WordTimed = quality.Usable && quality.WordTimed });
    }
}
