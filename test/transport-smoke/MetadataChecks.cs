using FoliaLyrics;

// test/transport-smoke/MetadataChecks.cs — background metadata cannot block transport or publish superseded songs.
internal static class MetadataChecks
{
    public static async Task Run(Action<bool, string> check)
    {
        var clock = new ManualClock();
        var cache = new MediaMetadataCache<string>(clock);
        var changes = 0; var reads = 0;
        var first = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        Task<string> Read(long revision, Func<CancellationToken, Task<string>> load, nint session = 1)
            => cache.Read(session, revision, load, () => true, () => changes++, CancellationToken.None);
        var initial = Read(0, _ => { reads++; return first.Task; });
        var duplicate = Read(0, _ => { reads++; return first.Task; });
        check(!initial.IsCompleted && !duplicate.IsCompleted && reads == 1, "first metadata read waits once and coalesces duplicate polls");
        first.SetResult("song-a");
        check(await initial == "song-a" && await duplicate == "song-a" && changes == 1, "first completed metadata identifies the song once");
        clock.Advance(.5);
        var slow = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        CancellationToken slowToken = default;
        var immediate = Read(0, token => { reads++; slowToken = token; return slow.Task; });
        check(immediate.IsCompletedSuccessfully && await immediate == "song-a" && !slow.Task.IsCompleted,
            "slow metadata refresh immediately returns the known song for pause and clock reads");
        clock.Advance(1);
        check(await Read(0, _ => { reads++; return slow.Task; }) == "song-a" && reads == 2,
            "repeated transport updates reuse the in-flight metadata request");
        check(await Read(1, _ => Task.FromResult("song-b")) == "song-b" && slowToken.IsCancellationRequested,
            "metadata event cancels the older request and refreshes without waiting for polling cooldown");
        slow.SetResult("song-old");
        await Task.Yield();
        check(cache.Value == "song-b" && changes == 2, "late metadata from a superseded event cannot replace the current song");
        var replacement = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        var replacing = Read(0, _ => replacement.Task, 2);
        check(!replacing.IsCompleted && cache.Value is null, "a replacement native session cannot reuse the old session's metadata");
        cache.Clear(); replacement.SetResult("wrong-session");
        await Cancelled(replacing, check, "reconnect rejects the late old session's initial metadata");
        check(cache.Value is null, "reconnect leaves no stale song cached");
        await Cancelled(cache.Read(3, 0, _ => Task.FromResult("wrong-revision"), () => false, () => changes++, CancellationToken.None), check,
            "a changed source revision rejects otherwise successful metadata");
        cache.Clear();
        await Read(0, _ => Task.FromResult("song-c"));
        clock.Advance(.5);
        var failed = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        var failureObserved = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var stillKnown = cache.Read(1, 0, _ => failed.Task, () => true, () => failureObserved.TrySetResult(), CancellationToken.None);
        check(stillKnown.IsCompletedSuccessfully && await stillKnown == "song-c", "cached metadata remains available while a refresh is pending");
        failed.SetException(new IOException("synthetic player failure"));
        await failureObserved.Task.WaitAsync(TimeSpan.FromSeconds(3));
        try { await Read(0, _ => Task.FromResult("unused")); throw new Exception("metadata failure was lost"); }
        catch (IOException) { check(true, "background metadata failure reaches polling so it can reconnect"); }
        cache.Clear();
    }

    private static async Task Cancelled(Task<string> pending, Action<bool, string> check, string message)
    {
        try { await pending.WaitAsync(TimeSpan.FromSeconds(3)); throw new Exception(message); }
        catch (OperationCanceledException) { check(true, message); }
    }
    private sealed class ManualClock : TimeProvider
    {
        private DateTimeOffset now = new(2026, 10, 12, 0, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => now;
        public void Advance(double seconds) => now = now.AddSeconds(seconds);
    }
}
