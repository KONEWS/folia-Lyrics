using System.Text;
using System.Text.Json;

// native/Online/QqLyricProvider.cs: Request mapping follows Folia's qqLyricProvider.ts.
namespace FoliaLyrics;
internal sealed class QqLyricProvider(OnlineHttp http) : IOnlineLyricProvider
{
    public string Id => "qq";
    public string Name => "QQ 音乐";
    private async Task<JsonDocument> Request(string method, string module, object param, CancellationToken token)
    {
        var doc = await http.PostQq(new
        {
            comm = new { ct = 11, cv = "1003006", v = "1003006", os_ver = "15", phonetype = "24122RKC7C",
                rom = "Redmi/miro/miro:15/AE3A.240806.005/OS2.0.102.0.VOMCNXM:user/release-keys", tmeAppID = "qqmusiclight", nettype = "NETWORK_WIFI", udid = "0", uid = "0" },
            request = new { method, module, param }
        }, token);
        if (doc.RootElement.Number("code") != 0 || doc.RootElement.Field("request").Number("code") != 0)
        { var code = doc.RootElement.Field("request").Text("code"); doc.Dispose(); throw new IOException("QQ 接口暂不可用，代码 " + code); }
        return doc;
    }
    public async Task<LyricCandidate[]> Search(LyricQuery q, CancellationToken token)
    {
        using var doc = await Request("DoSearchForQQMusicLite", "music.search.SearchCgiService", new
        {
            search_id = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString(), remoteplace = "search.android.keyboard", query = (q.Title + " " + q.Artist).Trim(),
            search_type = 0, num_per_page = 20, page_num = 1, highlight = 0, nqc_flag = 0, page_id = 1, grp = 1
        }, token);
        return doc.RootElement.Field("request").Field("data").Field("body").Field("item_song").Items().Select(s => new LyricCandidate(Id, s.Text("id"), s.Text("title"),
            string.Join(" / ", s.Field("singer").Items().Select(a => a.Text("name"))), s.Field("album").Text("name"), s.Number("interval"), "逐字 / 逐行"))
            .Where(c => c.Id.Length > 0 && c.Title.Length > 0).ToArray();
    }
    private Task<JsonDocument> GetLyric(LyricCandidate c, bool word, CancellationToken token) => Request("GetPlayLyricInfo", "music.musichallSong.PlayLyricInfo", new
    {
        albumName = Encode(c.Album), crypt = word ? 1 : 0, ct = 19, cv = 2111, interval = (int)c.Duration, lrc_t = 0,
        qrc = word ? 1 : 0, qrc_t = 0, roma = word ? 1 : 0, roma_t = 0, singerName = Encode(c.Artist), songID = long.Parse(c.Id),
        songName = Encode(c.Title), trans = 1, trans_t = 0, type = 0
    }, token);
    public async Task<Lyrics?> Fetch(LyricCandidate c, Song song, CancellationToken token)
    {
        string encrypted = "", translation = "", roma = "", fallback = "", fallbackTranslation = "";
        try
        {
            using var word = await GetLyric(c, true, token); var data = word.RootElement.Field("request").Field("data");
            encrypted = data.Text("lyric"); translation = data.Text("trans"); roma = data.Text("roma");
        }
        catch (Exception) when (!token.IsCancellationRequested) { /* Still try the plain synchronized response. */ }
        try
        {
            using var line = await GetLyric(c, false, token); var data = line.RootElement.Field("request").Field("data");
            fallback = Decode(data.Text("lyric")); fallbackTranslation = Decode(data.Text("trans"));
        }
        catch (Exception) when (!token.IsCancellationRequested && encrypted.Length > 0) { /* A valid QRC can work without its optional fallback. */ }
        if (encrypted.Length == 0) return fallback.Length == 0 ? null : new(song.Key, c.Title, c.Artist, fallback, $"QQ 音乐 · 逐行 · {c.Id}", "", false, "lrc", fallbackTranslation);
        return new(song.Key, c.Title, c.Artist, encrypted, $"QQ 音乐 · 逐字优先 · {c.Id}", "", false, "qq-qrc", translation, roma, fallback, fallbackTranslation);
    }
    private static string Encode(string text) => Convert.ToBase64String(Encoding.UTF8.GetBytes(text));
    private static string Decode(string text) => text.Length == 0 ? "" : Encoding.UTF8.GetString(Convert.FromBase64String(text));
}
