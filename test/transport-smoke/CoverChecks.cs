using FoliaLyrics;

// test/transport-smoke/CoverChecks.cs — synthetic artwork/session checks without media devices or user data.
internal static class CoverChecks
{
    public static async Task Run(Action<bool, string> check)
    {
        byte[] jpeg = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46];
        var jpegUrl = "data:image/jpeg;base64," + Convert.ToBase64String(jpeg);
        check(CoverImage.ToDataUrl(jpeg, "image/jpeg,image/jpe,image/jpg") == jpegUrl,
            "foobar SMTC MIME aliases become one valid JPEG data URL header");
        check(CoverImage.ToDataUrl(jpeg, "application/octet-stream") == jpegUrl
            && CoverImage.ToDataUrl(jpeg, null) == jpegUrl,
            "JPEG bytes identify artwork when the player omits its image type");
        byte[] png = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV60AAAAASUVORK5CYII=");
        var pngUrl = "data:image/png;base64," + Convert.ToBase64String(png);
        check(CoverImage.ToDataUrl(png, "image/jpeg") == pngUrl,
            "PNG magic overrides an incorrect native MIME hint");
        check(CoverImage.ToDataUrl("GIF89a"u8, "application/octet-stream").StartsWith("data:image/gif;base64,")
            && CoverImage.ToDataUrl("RIFF0000WEBP"u8, "").StartsWith("data:image/webp;base64,"),
            "GIF and WebP artwork use their actual media type");
        check(CoverImage.ToDataUrl([], "image/jpeg") == ""
            && CoverImage.ToDataUrl("unsupported"u8, "application/octet-stream") == "",
            "empty or unknown non-image artwork remains missing");
        check(CoverImage.ToDataUrl("<svg/>"u8, " IMAGE/SVG+XML; charset=utf-8,image/png").StartsWith("data:image/svg+xml;base64,"),
            "declared image type strips parameters and aliases before building a data URL");
        using (var partial = new ChunkedStream(png, 3))
        {
            check(await CoverImage.Read(partial, png.Length, "image/jpeg") == pngUrl && partial.Reads > 1,
                "partial stream reads are accumulated into complete artwork");
        }
        using (var truncated = new ChunkedStream(png[..^3], 3))
        {
            await Throws<EndOfStreamException>(() => CoverImage.Read(truncated, png.Length, "image/png"), check,
                "truncated artwork is rejected instead of caching zero-padded image bytes");
        }
        using (var untouched = new ChunkedStream(png, 3))
        {
            check(await CoverImage.Read(untouched, CoverImage.MaximumBytes + 1L, "image/png") == ""
                && await CoverImage.Read(untouched, 0, "image/png") == "" && untouched.Reads == 0,
                "empty and oversized native artwork is rejected before reading or allocating its body");
        }
        using (var cancelled = new MemoryStream(png))
        using (var token = new CancellationTokenSource())
        {
            token.Cancel();
            await Throws<OperationCanceledException>(() => CoverImage.Read(cancelled, png.Length, "image/png", token.Token), check,
                "artwork read honors source shutdown cancellation");
        }

        var clock = new ManualClock();
        var cache = new MediaCoverCache(clock);
        var reads = 0;
        Task<string> Missing() { reads++; return Task.FromResult(""); }
        Task<string> Jpeg() { reads++; return Task.FromResult(jpegUrl); }
        Task<string> Png() { reads++; return Task.FromResult(pngUrl); }
        check(await cache.Read(1, "song-a", 0, Missing, () => true) == "", "new song with delayed thumbnail starts without artwork");
        clock.Advance(.5);
        check(await cache.Read(1, "song-a", 0, Jpeg, () => true) == "" && reads == 1,
            "missing-thumbnail retries are throttled between media polls");
        clock.Advance(1.5);
        check(await cache.Read(1, "song-a", 0, Jpeg, () => true) == jpegUrl && reads == 2,
            "thumbnail arriving after song metadata is retried and accepted");
        clock.Advance(.5);
        check(await cache.Read(1, "song-a", 0, Png, () => true) == jpegUrl && reads == 2,
            "successful artwork is reused without decoding every clock poll");
        check(await cache.Read(1, "song-a", 1, Png, () => true) == pngUrl && reads == 3,
            "same-song media-properties event refreshes artwork immediately");
        clock.Advance(30);
        check(await cache.Read(1, "song-a", 1, Jpeg, () => true) == jpegUrl && reads == 4,
            "artwork refresh also recovers players that omit metadata events");
        check(await cache.Read(1, "song-b", 1, Missing, () => true) == "" && cache.Value == "",
            "switching song clears the previous cover before the new thumbnail arrives");
        check(await cache.Read(1, "song-b", 2, Png, () => true) == pngUrl,
            "a delayed-cover event bypasses the failed-read retry interval");
        check(await cache.Read(2, "song-b", 2, Missing, () => true) == "",
            "a recreated native session cannot reuse another session's cover with the same song key");
        clock.Advance(2);
        await Throws<IOException>(() => cache.Read(2, "song-b", 2, () => throw new IOException("Temporary thumbnail failure"), () => true), check,
            "native thumbnail failure stays observable for diagnostics");
        clock.Advance(2);
        check(await cache.Read(2, "song-b", 2, Jpeg, () => true) == jpegUrl,
            "a failed thumbnail read does not permanently poison the song cache");
        check(await cache.Read(2, "song-b", 3, Missing, () => true) == jpegUrl,
            "transient same-song thumbnail loss retains its last complete cover");
        clock.Advance(2);
        check(await cache.Read(2, "song-b", 3, Png, () => true) == pngUrl,
            "transient same-song artwork loss still retries promptly");

        var pending = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
        var oldRead = cache.Read(2, "song-old", 4, () => pending.Task, () => true);
        check(await cache.Read(2, "song-new", 4, Png, () => true) == pngUrl, "new song artwork replaces a pending old request");
        pending.SetResult(jpegUrl);
        await Throws<OperationCanceledException>(() => oldRead, check, "late old-song cover cannot overwrite the new song");
        check(cache.Value == pngUrl, "late old-song read preserves the new cover cache");
        pending = new(TaskCreationOptions.RunContinuationsAsynchronously);
        var invalidated = cache.Read(2, "song-new", 5, () => pending.Task, () => true);
        cache.Clear(); pending.SetResult(jpegUrl);
        await Throws<OperationCanceledException>(() => invalidated, check, "source invalidation discards in-flight artwork");
        check(cache.Value == "", "source invalidation releases retained artwork");
        await Throws<OperationCanceledException>(() => cache.Read(3, "song-c", 6, Jpeg, () => false), check,
            "changed source revision rejects an otherwise complete thumbnail");

        pending = new(TaskCreationOptions.RunContinuationsAsynchronously);
        var slowReads = 0;
        Task<string> Slow() { slowReads++; return pending.Task; }
        var errors = new List<Exception>();
        check(cache.Refresh(4, "song-slow", 7, Slow, () => true, errors.Add) == "" && !pending.Task.IsCompleted,
            "song and playback snapshot can return before a slow cover completes");
        var pendingRefresh = cache.Read(4, "song-slow", 7, Slow, () => true);
        clock.Advance(3);
        check(cache.Refresh(4, "song-slow", 7, Slow, () => true, errors.Add) == "" && slowReads == 1,
            "repeated clock polls reuse an in-flight thumbnail even after the retry deadline");
        pending.SetResult(jpegUrl);
        check(await pendingRefresh == jpegUrl && cache.Value == jpegUrl && errors.Count == 0,
            "completed asynchronous cover is available to the next presentation poll");
        pending = new(TaskCreationOptions.RunContinuationsAsynchronously);
        var staleEvent = cache.Read(4, "song-slow", 8, () => pending.Task, () => true);
        await cache.Read(4, "song-slow", 9, Png, () => true);
        pending.SetResult(jpegUrl);
        await Throws<OperationCanceledException>(() => staleEvent, check, "older same-song artwork event cannot overwrite newer artwork");
        check(cache.Value == pngUrl, "newer same-song cover survives old read completion");
        check(cache.Refresh(4, "song-slow", 10, () => throw new IOException("cover failed"), () => true, errors.Add) == pngUrl
            && errors.Count == 1, "background artwork errors are observed while retaining current cover");

        Song session = new("song-a", "Title", "Artist", "", "player", true, 1, 200, 1, true,
            [new("player", "Player")], "Album", "session-a", new(true, true, true, true, true));
        check(!MediaPresentation.Same(null, session), "initial media session is sent to the WebView");
        check(MediaPresentation.Same(session, session with { Position = 99 }), "clock-only updates do not resend the full session packet");
        check(!MediaPresentation.Same(session, session with { Cover = jpegUrl }), "late artwork resends the same-song presentation packet");
        check(!MediaPresentation.Same(session with { Cover = jpegUrl }, session with { Cover = pngUrl }),
            "same-song replacement artwork is forwarded for fresh theme extraction");
        check(!MediaPresentation.Same(session, session with { Album = "Updated Album" })
            && !MediaPresentation.Same(session, session with { Sources = [new("player", "Updated Player")] }),
            "visible metadata and source labels participate in session deduplication");
    }

    private static async Task Throws<T>(Func<Task<string>> action, Action<bool, string> check, string name) where T : Exception
    {
        try { await action(); }
        catch (T) { check(true, name); return; }
        throw new Exception("Expected " + typeof(T).Name + ": " + name);
    }

    private sealed class ManualClock : TimeProvider
    {
        private DateTimeOffset now = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => now;
        public void Advance(double seconds) => now = now.AddSeconds(seconds);
    }

    private sealed class ChunkedStream(byte[] bytes, int chunk) : MemoryStream(bytes)
    {
        public int Reads { get; private set; }
        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken token = default)
        {
            Reads++;
            return base.ReadAsync(buffer[..Math.Min(chunk, buffer.Length)], token);
        }
    }
}
