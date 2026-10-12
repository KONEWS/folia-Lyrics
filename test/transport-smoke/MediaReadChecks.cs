using FoliaLyrics;

// test/transport-smoke/MediaReadChecks.cs — stalled reads release polling and preserve cancellation semantics.
internal static class MediaReadChecks
{
    public static async Task Run(Action<bool, string> check)
    {
        var pending = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        CancellationToken readToken = default;
        var timedRead = MediaReadDeadline.Read(token => { readToken = token; return pending.Task; }, CancellationToken.None, TimeSpan.FromMilliseconds(30));
        try
        {
            await timedRead.WaitAsync(TimeSpan.FromSeconds(3));
            throw new Exception("stalled media read did not time out");
        }
        catch (TimeoutException)
        {
            check(timedRead.IsFaulted && readToken.IsCancellationRequested && !pending.Task.IsCompleted,
                "media deadline returns even when the player ignores cancellation");
        }
        check(await MediaReadDeadline.Read(_ => Task.FromResult("new-song"), CancellationToken.None) == "new-song",
            "the next media read can recover before the old player request completes");
        pending.SetResult("old-song");
        using var lifetime = new CancellationTokenSource();
        var shutdown = MediaReadDeadline.Read(_ => new TaskCompletionSource<string>().Task, lifetime.Token);
        lifetime.Cancel();
        try { await shutdown.WaitAsync(TimeSpan.FromSeconds(3)); throw new Exception("shutdown did not cancel media read"); }
        catch (OperationCanceledException) { check(true, "application shutdown remains cancellation rather than a connection timeout"); }
        try
        {
            await MediaReadDeadline.Read<string>(_ => Task.FromException<string>(new IOException("player failure")), CancellationToken.None);
            throw new Exception("media failure was swallowed");
        }
        catch (IOException) { check(true, "media failures retain their original exception for reconnection diagnostics"); }
    }
}
