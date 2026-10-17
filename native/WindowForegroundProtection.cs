// native/WindowForegroundProtection.cs — short launch holds stay separate from the user's saved pin preference.
namespace FoliaLyrics;
internal sealed class WindowForegroundProtection(Func<long>? clock = null)
{
    internal const int DurationMilliseconds = 5000;
    private readonly Func<long> now = clock ?? (() => Environment.TickCount64);
    private readonly HashSet<Request> requests = [];
    private long generation;

    internal sealed class Request(long generation, long expiresAt)
    {
        internal long Generation { get; } = generation;
        internal long ExpiresAt { get; set; } = expiresAt;
        internal bool Cancelled { get; set; }
    }

    internal Request Begin()
    {
        var request = new Request(generation, now() + DurationMilliseconds);
        requests.Add(request);
        return request;
    }

    // A slow launch may finish after its first hold expired; explicit user changes invalidate every older request.
    internal bool Renew(Request request)
    {
        if (request.Cancelled || request.Generation != generation) return false;
        request.ExpiresAt = now() + DurationMilliseconds;
        requests.Add(request);
        return true;
    }

    internal void Cancel(Request request) { request.Cancelled = true; requests.Remove(request); }
    internal void Clear() { generation++; requests.Clear(); }

    internal int RemainingMilliseconds()
    {
        var current = now();
        requests.RemoveWhere(request => request.ExpiresAt <= current);
        return requests.Count == 0 ? 0 : (int)Math.Clamp(requests.Max(request => request.ExpiresAt) - current, 1, DurationMilliseconds);
    }
}
