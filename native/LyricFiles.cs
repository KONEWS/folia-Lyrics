using System.Text;
using System.Text.RegularExpressions;

// native/LyricFiles.cs
namespace FoliaLyrics;
internal sealed record Entry(string Path, string Title, string Artist);
internal sealed record Lyrics(string Key, string Title, string Artist, string Content, string Source, string Cover, bool Embedded,
    string Format = "", string Translation = "", string Romanization = "", string FallbackContent = "", string FallbackTranslation = "");
internal static class LyricFiles
{
    public static readonly HashSet<string> Audio = new(StringComparer.OrdinalIgnoreCase) { ".flac", ".mp3", ".m4a", ".mp4", ".ogg", ".opus", ".wav", ".ape", ".wma", ".aiff" };
    public static readonly string[] TextExtensions = [".ttml", ".yrc", ".qrc", ".lrc", ".fia"];
    public static bool Supported(string path) => Audio.Contains(System.IO.Path.GetExtension(path)) || TextExtensions.Contains(System.IO.Path.GetExtension(path).ToLowerInvariant());
    public static string Normalize(string text) => Regex.Replace(text.Normalize(NormalizationForm.FormKC).ToLowerInvariant(), @"[^\p{L}\p{N}]", "");
    public static string Key(string title, string artist) => Normalize(title) + "|" + Normalize(artist);
    public static Entry Inspect(string path)
    {
        if (Audio.Contains(System.IO.Path.GetExtension(path)))
        {
            using var f = TagLib.File.Create(path, TagLib.ReadStyle.None);
            return new(path, string.IsNullOrWhiteSpace(f.Tag.Title) ? System.IO.Path.GetFileNameWithoutExtension(path) : f.Tag.Title, string.Join(" / ", f.Tag.Performers));
        }
        var raw = ReadText(path); var title = Tag(raw, "ti");
        return new(path, title.Length > 0 ? title : System.IO.Path.GetFileNameWithoutExtension(path), Tag(raw, "ar"));
    }
    public static Lyrics Read(string path, string key, string title, string artist)
    {
        if (!Audio.Contains(System.IO.Path.GetExtension(path))) return new(key, title, artist, ReadText(path), System.IO.Path.GetFileName(path), "", false);
        using var f = TagLib.File.Create(path, TagLib.ReadStyle.None);
        var sidecar = TextExtensions.Select(ext => System.IO.Path.ChangeExtension(path, ext)).FirstOrDefault(File.Exists);
        var content = sidecar is null ? f.Tag.Lyrics ?? "" : ReadText(sidecar);
        var picture = f.Tag.Pictures.FirstOrDefault(); var cover = "";
        if (picture is not null && picture.Data.Count < 4_000_000) cover = $"data:{picture.MimeType};base64,{Convert.ToBase64String(picture.Data.Data)}";
        return new(key, title, artist, content, sidecar is null ? "内嵌歌词 · " + System.IO.Path.GetFileName(path) : System.IO.Path.GetFileName(sidecar), cover, sidecar is null);
    }
    private static string Tag(string raw, string name) => Regex.Match(raw, @"\[" + name + @":([^\]]*)\]", RegexOptions.IgnoreCase).Groups[1].Value.Trim();
    private static string ReadText(string path)
    {
        if (new FileInfo(path).Length > 8_000_000) throw new IOException("歌词文件超过 8 MB");
        var bytes = File.ReadAllBytes(path);
        if (bytes.Length >= 2 && (bytes[0] == 0xff && bytes[1] == 0xfe || bytes[0] == 0xfe && bytes[1] == 0xff)) return File.ReadAllText(path, Encoding.Unicode);
        try { return new UTF8Encoding(false, true).GetString(bytes).TrimStart('\ufeff'); }
        catch (DecoderFallbackException) { return Encoding.GetEncoding(936).GetString(bytes); }
    }
}
