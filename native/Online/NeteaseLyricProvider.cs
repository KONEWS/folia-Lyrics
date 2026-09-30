// native/Online/NeteaseLyricProvider.cs: Normalize the public lyric endpoints into the desktop contract.
namespace FoliaLyrics;
internal sealed class NeteaseLyricProvider(OnlineHttp http) : IOnlineLyricProvider
{
    public string Id => "netease";
    public string Name => "网易云音乐";
    public async Task<LyricCandidate[]> Search(LyricQuery q, CancellationToken token)
    {
        var url = OnlineHttp.Url("https://music.163.com/api/search/get", ("s", (q.Title + " " + q.Artist).Trim()), ("type", 1), ("limit", 20), ("offset", 0));
        using var doc = await http.Get(url, token, "https://music.163.com/"); var root = doc.RootElement;
        if (root.Number("code") != 200) throw new IOException("搜索接口暂不可用");
        return root.Field("result").Field("songs").Items().Select(s => new LyricCandidate(Id, s.Text("id"), s.Text("name"),
            string.Join(" / ", s.Field("artists").Items().Select(a => a.Text("name"))), s.Field("album").Text("name"), s.Number("duration") / 1000, "获取时检查逐字/逐行"))
            .Where(s => s.Id.Length > 0 && s.Title.Length > 0).ToArray();
    }
    public async Task<Lyrics?> Fetch(LyricCandidate c, Song song, CancellationToken token)
    {
        var url = OnlineHttp.Url("https://music.163.com/api/song/lyric/v1", ("id", c.Id), ("cp", "false"), ("lv", 0), ("tv", 0), ("rv", 0), ("kv", 0), ("yv", 0), ("ytv", 0), ("yrv", 0));
        using var doc = await http.Get(url, token, "https://music.163.com/"); var root = doc.RootElement;
        if (root.Number("code") != 200) throw new IOException("歌词接口暂不可用");
        var word = root.Field("yrc").Text("lyric"); var timed = root.Field("lrc").Text("lyric"); var useWord = word.Contains('(');
        var content = useWord ? word : timed; if (content.Length == 0) return null;
        var translation = root.Field(useWord ? "ytlrc" : "tlyric").Text("lyric");
        var roma = root.Field(useWord ? "yromalrc" : "romalrc").Text("lyric");
        if (translation.Length == 0) translation = root.Field("tlyric").Text("lyric");
        if (roma.Length == 0) roma = root.Field("romalrc").Text("lyric");
        return new(song.Key, c.Title, c.Artist, content, $"{Name} · {(useWord ? "逐字" : "逐行")} · {c.Id}", "", false, useWord ? "yrc" : "lrc", translation, roma);
    }
}
