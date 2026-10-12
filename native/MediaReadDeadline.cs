// native/MediaReadDeadline.cs — bound media polling even when a player ignores cancellation.
namespace FoliaLyrics;
internal static class MediaReadDeadline
{
    // Await cancellation independently of the player's implementation so polling can always resume.
    public static async Task<T> Read<T>(Func<CancellationToken, Task<T>> read, CancellationToken lifetime, TimeSpan? timeout = null)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(lifetime);
        deadline.CancelAfter(timeout ?? TimeSpan.FromSeconds(3));
        try { return await read(deadline.Token).WaitAsync(deadline.Token); }
        catch (OperationCanceledException error) when (!lifetime.IsCancellationRequested && deadline.IsCancellationRequested)
        { throw new TimeoutException("播放器媒体信息读取超时，正在重新连接。", error); }
    }
}
