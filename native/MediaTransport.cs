// native/MediaTransport.cs
namespace FoliaLyrics;

internal sealed record MediaControlRequest(string RequestId, string SessionId, string SongKey, string Action);
internal sealed record MediaControlResult(string RequestId, bool Success, string Message);
internal sealed record MediaControlSnapshot(string SessionId, string SongKey, bool Playing, MediaCapabilities Controls);
internal interface IMediaControlTarget
{
    Task<MediaControlSnapshot> Read(CancellationToken token);
    Task<bool> Send(string action, CancellationToken token);
}

// Serializes user requests without queueing stale clicks. The player remains the playback-state authority.
internal sealed class MediaTransport(TimeSpan? timeout = null, Action<Exception>? log = null)
{
    private int busy;
    public async Task<MediaControlResult> Execute(MediaControlRequest request, Func<IMediaControlTarget?> resolve,
        Func<bool> isCurrent, CancellationToken lifetime = default)
    {
        MediaControlResult Result(bool success, string message) => new(request.RequestId, success, message);
        if (request.Action is not ("play" or "pause" or "previous" or "next")) return Result(false, "未知媒体控制操作。");
        if (Interlocked.CompareExchange(ref busy, 1, 0) != 0) return Result(false, "正在等待播放器响应，请稍后再试。");
        try
        {
            using var deadline = CancellationTokenSource.CreateLinkedTokenSource(lifetime);
            deadline.CancelAfter(timeout ?? TimeSpan.FromSeconds(5));
            if (!isCurrent() || request.SessionId.Length == 0) return Result(false, "播放器已变化，请确认当前歌曲后重试。");
            var target = resolve();
            if (target is null) return Result(false, "播放器已断开，请在音乐软件中播放歌曲后重试。");
            var snapshot = await target.Read(deadline.Token).WaitAsync(deadline.Token);
            if (!isCurrent() || snapshot.SessionId != request.SessionId || snapshot.SongKey != request.SongKey)
                return Result(false, "歌曲或播放器已变化，未执行本次操作。");
            if (request.Action == "play" && snapshot.Playing) return Result(true, "播放器已经在播放。");
            if (request.Action == "pause" && !snapshot.Playing) return Result(true, "播放器已经暂停。");
            var caps = snapshot.Controls;
            var operation = request.Action switch
            {
                "play" when caps.Play => "play", "pause" when caps.Pause => "pause",
                "play" or "pause" when caps.Toggle => "toggle",
                "previous" when caps.Previous => "previous", "next" when caps.Next => "next", _ => ""
            };
            if (operation.Length == 0) return Result(false, "当前播放器未开放这项控制，请在音乐软件中操作。");
            deadline.Token.ThrowIfCancellationRequested();
            var accepted = await target.Send(operation, deadline.Token).WaitAsync(deadline.Token);
            if (!accepted) return Result(false, "播放器未接受操作，请检查播放器状态或在音乐软件中操作。");
            return Result(true, "已发送操作，正在同步播放器状态。");
        }
        catch (OperationCanceledException)
        {
            return Result(false, "未能及时确认播放器响应，请查看实际状态后再操作。");
        }
        catch (Exception error)
        {
            log?.Invoke(error);
            return Result(false, "无法控制当前播放器，请确认音乐软件仍在运行。");
        }
        finally { Volatile.Write(ref busy, 0); }
    }
}
