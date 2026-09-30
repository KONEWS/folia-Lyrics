using System.IO.Compression;
using System.Text;

// native/Online/KugouLyricProvider.cs: Only lyric search and download; no audio endpoint.
namespace FoliaLyrics;
internal sealed class KugouLyricProvider(OnlineHttp http) : IOnlineLyricProvider
{
    public string Id => "kugou";
    public string Name => "酷狗音乐";
    public async Task<LyricCandidate[]> Search(LyricQuery q, CancellationToken token)
    {
        var url = OnlineHttp.Url("https://lyrics.kugou.com/search", ("ver", 1), ("man", "yes"), ("client", "pc"), ("keyword", (q.Artist + " " + q.Title).Trim()), ("duration", q.Duration > 0 ? (int)(q.Duration * 1000) : -1));
        using var doc = await http.Get(url, token); var root = doc.RootElement;
        if (root.Number("status") != 200) throw new IOException("搜索接口暂不可用");
        return root.Field("candidates").Items().Select(s => new LyricCandidate(Id, s.Text("id"), s.Text("song"), s.Text("singer"), "", s.Number("duration") / 1000, "优先获取 KRC 逐字") { AccessKey = s.Text("accesskey") })
            .Where(s => s.Id.Length > 0 && s.AccessKey.Length > 0).DistinctBy(s => s.Key).ToArray();
    }
    public async Task<Lyrics?> Fetch(LyricCandidate c, Song song, CancellationToken token)
    {
        var url = OnlineHttp.Url("https://lyrics.kugou.com/download", ("ver", 1), ("client", "pc"), ("id", c.Id), ("accesskey", c.AccessKey), ("fmt", "krc"), ("charset", "utf8"));
        using var doc = await http.Get(url, token); var root = doc.RootElement;
        if (root.Number("status") != 200) throw new IOException("歌词接口暂不可用");
        var content = root.Text("content"); if (content.Length == 0) return null;
        var bytes = Convert.FromBase64String(content); var isKrc = bytes.Length > 4 && bytes.AsSpan(0, 4).SequenceEqual("krc1"u8);
        var text = isKrc ? DecodeKrc(bytes) : Encoding.UTF8.GetString(bytes).TrimStart('\ufeff');
        return new(song.Key, c.Title, c.Artist, text, $"{Name} · {(isKrc ? "逐字" : "逐行")} · {c.Id}", "", false, isKrc ? "krc" : "lrc");
    }
    internal static string DecodeKrc(byte[] bytes)
    {
        byte[] key = [64, 71, 97, 119, 94, 50, 116, 71, 81, 54, 49, 45, 206, 210, 110, 105];
        var compressed = bytes.AsSpan(4).ToArray(); for (var i = 0; i < compressed.Length; i++) compressed[i] ^= key[i % key.Length];
        using var stream = new ZLibStream(new MemoryStream(compressed), CompressionMode.Decompress); using var output = new MemoryStream();
        var buffer = new byte[8192]; int length;
        while ((length = stream.Read(buffer)) > 0) { if (output.Length + length > 2_000_000) throw new IOException("歌词解码结果过大"); output.Write(buffer, 0, length); }
        return Encoding.UTF8.GetString(output.ToArray());
    }
}
