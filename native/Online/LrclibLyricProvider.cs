// native/Online/LrclibLyricProvider.cs
namespace FoliaLyrics;
internal sealed class LrclibLyricProvider(OnlineHttp http) : IOnlineLyricProvider
{
    public string Id => "lrclib";
    public string Name => "LRCLIB";
    public async Task<LyricCandidate[]> Search(LyricQuery q, CancellationToken token)
    {
        var url = OnlineHttp.Url("https://lrclib.net/api/search", ("track_name", q.Title), ("artist_name", q.Artist));
        using var doc = await http.Get(url, token);
        if (doc.RootElement.ValueKind != System.Text.Json.JsonValueKind.Array) throw new IOException("搜索返回格式异常");
        return doc.RootElement.Items().Select(s => new LyricCandidate(Id, s.Text("id"), s.Text("trackName"), s.Text("artistName"), s.Text("albumName"), s.Number("duration"),
            s.Text("syncedLyrics").Length > 0 ? "逐行" : "无同步时间轴", s.Text("syncedLyrics").Length > 0) { InlineContent = s.Text("syncedLyrics") }).ToArray();
    }
    public Task<Lyrics?> Fetch(LyricCandidate c, Song song, CancellationToken token) => Task.FromResult<Lyrics?>(c.InlineContent.Length > 0
        ? new(song.Key, c.Title, c.Artist, c.InlineContent, $"LRCLIB · 逐行 · {c.Id}", "", false, "lrc") : null);
}
