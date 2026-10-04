using Windows.Media.Control;
using Windows.Storage.Streams;

// native/MediaMonitor.cs
namespace FoliaLyrics;
internal sealed class MediaMonitor : IDisposable
{
    private GlobalSystemMediaTransportControlsSessionManager? manager;
    private GlobalSystemMediaTransportControlsSession? observed;
    private string observedKey = "";
    private readonly MediaSessionBinding<GlobalSystemMediaTransportControlsSession> binding = new();
    private int revision;
    private string lastDiagnostic = "";
    private readonly MediaCoverCache covers = new();
    private GlobalSystemMediaTransportControlsSession? coverSession;
    private nint coverSessionIdentity;
    private long coverRevision;
    public async Task<Song> Read(string preferred, CancellationToken token = default)
    {
        var readRevision = revision;
        manager ??= await GlobalSystemMediaTransportControlsSessionManager.RequestAsync().AsTask(token);
        var sessions = manager.GetSessions().ToArray(); var current = manager.GetCurrentSession();
        var sources = sessions.Select(s => new MediaSource(s.SourceAppUserModelId, s.SourceAppUserModelId)).DistinctBy(s => s.Id).ToArray();
        var candidates = Candidates(sessions);
        var selection = binding.Select(candidates, current is null ? 0 : WindowsSessionIdentity.Get(current), preferred);
        var session = selection?.Value;
        if (session is null) { Invalidate(); return new("", "", "", "", "", false, 0, 0, 1, false, sources); }
        WatchCover(session, selection!.Identity);
        var props = await session.TryGetMediaPropertiesAsync().AsTask(token); var info = session.GetPlaybackInfo(); var timeline = session.GetTimelineProperties();
        var key = WindowsMediaControlTarget.SongKey(session, props);
        var cover = "";
        try
        {
            cover = await covers.Read(selection.Identity, key, Interlocked.Read(ref coverRevision),
                () => ReadCover(props.Thumbnail, token), () => readRevision == revision && !token.IsCancellationRequested);
        }
        catch (OperationCanceledException) when (readRevision != revision || token.IsCancellationRequested) { throw; }
        catch (Exception e) { DataFiles.Log(e); cover = covers.Value; }
        var playing = info.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing;
        var rate = info.PlaybackRate ?? 1; if (!double.IsFinite(rate) || rate <= 0) rate = 1;
        var duration = Math.Max(0, (timeline.EndTime - timeline.StartTime).TotalSeconds);
        var position = Math.Max(0, (timeline.Position - timeline.StartTime).TotalSeconds);
        var elapsed = (DateTimeOffset.UtcNow - timeline.LastUpdatedTime).TotalSeconds;
        if (playing && elapsed is >= 0 and < 21600) position += elapsed * rate;
        if (duration > 0) position = Math.Clamp(position, 0, duration);
        if (readRevision != revision) throw new OperationCanceledException();
        var controls = WindowsMediaControlTarget.Capabilities(info);
        var diagnostic = $"source={session.SourceAppUserModelId}; session={binding.Id}; playing={playing}; controls={controls}";
        if (diagnostic != lastDiagnostic) { lastDiagnostic = diagnostic; MediaDiagnostics.Write(diagnostic); }
        observed = session; observedKey = key;
        return new(key, props.Title, props.Artist, cover, session.SourceAppUserModelId, playing, position, duration, rate, duration > 0, sources,
            props.AlbumTitle, binding.Id, controls);
    }
    public void Invalidate() { revision++; observed = null; binding.Clear(); observedKey = ""; WatchCover(null, 0); covers.Clear(); }
    // Artwork can arrive after title/artist and can change without changing the song key.
    private void WatchCover(GlobalSystemMediaTransportControlsSession? session, nint identity)
    {
        if (coverSessionIdentity == identity && coverSession is not null) return;
        if (coverSession is not null)
        {
            try { coverSession.MediaPropertiesChanged -= CoverChanged; }
            catch (Exception e) { DataFiles.Log(e); }
        }
        coverSession = session; coverSessionIdentity = identity;
        Interlocked.Increment(ref coverRevision);
        if (session is not null)
        {
            try { session.MediaPropertiesChanged += CoverChanged; }
            catch (Exception e) { DataFiles.Log(e); }
        }
    }
    private void CoverChanged(GlobalSystemMediaTransportControlsSession _, MediaPropertiesChangedEventArgs __)
        => Interlocked.Increment(ref coverRevision);
    private static async Task<string> ReadCover(IRandomAccessStreamReference? thumbnail, CancellationToken token)
    {
        if (thumbnail is null) return "";
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token);
        deadline.CancelAfter(TimeSpan.FromSeconds(2));
        using var stream = await thumbnail.OpenReadAsync().AsTask(deadline.Token);
        if (stream.Size is 0 or > CoverImage.MaximumBytes) return "";
        using var input = stream.GetInputStreamAt(0).AsStreamForRead();
        return await CoverImage.Read(input, (long)stream.Size, stream.ContentType, deadline.Token);
    }
    public void Dispose() => Invalidate();
    public bool IsCurrent(MediaControlRequest request)
    {
        var reason = observed is null ? "no observed session" : binding.Id != request.SessionId ? "session token changed"
            : observedKey != request.SongKey ? "song changed"
            : manager is null || !binding.Contains(Candidates(manager.GetSessions(), false), request.SessionId) ? "session unavailable" : "";
        if (reason.Length > 0) MediaDiagnostics.Write("control rejected: " + reason);
        return reason.Length == 0;
    }
    public IMediaControlTarget? Resolve(MediaControlRequest request)
    {
        if (!IsCurrent(request) || manager is null) return null;
        var fresh = binding.Find(Candidates(manager.GetSessions(), false), request.SessionId);
        return fresh is null ? null : new WindowsMediaControlTarget(fresh.Value, binding.Id);
    }
    private static SessionCandidate<GlobalSystemMediaTransportControlsSession>[] Candidates(IEnumerable<GlobalSystemMediaTransportControlsSession> sessions, bool readPlayback = true)
        => sessions.Select(s => new SessionCandidate<GlobalSystemMediaTransportControlsSession>(s, WindowsSessionIdentity.Get(s), s.SourceAppUserModelId, readPlayback && IsPlaying(s))).ToArray();
    private static bool IsPlaying(GlobalSystemMediaTransportControlsSession s)
    { try { return s.GetPlaybackInfo().PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing; } catch { return false; } }
}
