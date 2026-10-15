// native/Online/ManualOnlineSelection.cs — one download-and-inspection deadline, independent of provider cancellation cooperation.
namespace FoliaLyrics;
internal static class ManualOnlineSelection
{
    // Download and real parser verification share one budget; late ignored cancellations are observed but never applied.
    public static async Task<Lyrics> Read(OnlineLyrics online, LyricCandidate candidate, Song song, TimeSpan timeout,
        Func<Lyrics, CancellationToken, Task<LyricContentQuality>> inspect, CancellationToken token)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token); deadline.CancelAfter(timeout);
        Task<Lyrics?>? download = null; Task<LyricContentQuality>? inspection = null;
        try
        {
            download = online.Fetch(candidate, song, deadline.Token);
            var packet = await download.WaitAsync(deadline.Token);
            if (packet is null) throw new IOException("这个版本没有可用的同步歌词，请尝试其他结果");
            inspection = inspect(packet, deadline.Token);
            var quality = await inspection.WaitAsync(TimeSpan.FromSeconds(5), deadline.Token);
            deadline.Token.ThrowIfCancellationRequested();
            if (!quality.Usable) throw new IOException("这个版本无法解析为同步歌词，请尝试其他结果");
            return packet;
        }
        catch (OperationCanceledException error) when (!token.IsCancellationRequested)
        { throw new TimeoutException("所选歌词获取或检测超时，请重试或选择其他版本", error); }
        finally { deadline.Cancel(); Observe(download); Observe(inspection); }
    }
    private static void Observe(Task? pending)
    {
        if (pending is not null) _ = pending.ContinueWith(completed => { _ = completed.Exception; }, CancellationToken.None,
            TaskContinuationOptions.ExecuteSynchronously, TaskScheduler.Default);
    }
}
