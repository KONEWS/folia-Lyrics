using Windows.Media.Control;

// native/WindowsMediaControlTarget.cs
namespace FoliaLyrics;

internal sealed class WindowsMediaControlTarget(GlobalSystemMediaTransportControlsSession session, string id) : IMediaControlTarget
{
    public async Task<MediaControlSnapshot> Read(CancellationToken token)
    {
        var props = await session.TryGetMediaPropertiesAsync().AsTask(token);
        var info = session.GetPlaybackInfo();
        return new(id, SongKey(session, props), info.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing, Capabilities(info));
    }
    public Task<bool> Send(string action, CancellationToken token) => (action switch
    {
        "play" => session.TryPlayAsync(), "pause" => session.TryPauseAsync(),
        "toggle" => session.TryTogglePlayPauseAsync(), "previous" => session.TrySkipPreviousAsync(),
        "next" => session.TrySkipNextAsync(), _ => throw new ArgumentException("Unknown media action")
    }).AsTask(token);

    public static string SongKey(GlobalSystemMediaTransportControlsSession session, GlobalSystemMediaTransportControlsSessionMediaProperties props)
        => session.SourceAppUserModelId + "\n" + props.Title + "\n" + props.Artist + "\n" + props.AlbumTitle;
    public static MediaCapabilities Capabilities(GlobalSystemMediaTransportControlsSessionPlaybackInfo info)
    {
        var c = info.Controls;
        return new(c.IsPlayEnabled, c.IsPauseEnabled, c.IsPlayPauseToggleEnabled, c.IsPreviousEnabled, c.IsNextEnabled);
    }
}
