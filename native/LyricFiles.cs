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
    // Lyric files and embedded lyrics share one size guard.
    private const int MaximumTextBytes = 8_000_000;
    // Metadata scans read up to 8 MB of untrusted text: bounded tags plus a match timeout stop a malformed file from stalling the scan.
    private static readonly TimeSpan MatchTimeout = TimeSpan.FromMilliseconds(250);
    private static readonly Regex TitleTag = new(@"\[ti:([^\]\r\n]{0,256})\]", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, MatchTimeout);
    private static readonly Regex ArtistTag = new(@"\[ar:([^\]\r\n]{0,256})\]", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, MatchTimeout);
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
        var raw = ReadText(path); var title = Tag(raw, TitleTag);
        return new(path, title.Length > 0 ? title : System.IO.Path.GetFileNameWithoutExtension(path), Tag(raw, ArtistTag));
    }
    public static Lyrics Read(string path, string key, string title, string artist)
    {
        if (!Audio.Contains(System.IO.Path.GetExtension(path))) return new(key, title, artist, ReadText(path), System.IO.Path.GetFileName(path), "", false);
        using var f = TagLib.File.Create(path, TagLib.ReadStyle.None);
        var sidecar = TextExtensions.Select(ext => System.IO.Path.ChangeExtension(path, ext)).FirstOrDefault(File.Exists);
        var content = sidecar is null ? EmbeddedLyrics(f.Tag.Lyrics) : ReadText(sidecar);
        var picture = f.Tag.Pictures.FirstOrDefault(); var cover = "";
        if (picture is not null && picture.Data.Count < 4_000_000) cover = CoverDataUrl(picture.Data.Data, picture.MimeType);
        return new(key, title, artist, content, sidecar is null ? "内嵌歌词 · " + System.IO.Path.GetFileName(path) : System.IO.Path.GetFileName(sidecar), cover, sidecar is null);
    }
    // Returns the first "[ti:...]"/"[ar:...]" value, or an empty string when the tag is absent, overlong, or the scan times out.
    private static string Tag(string raw, Regex pattern)
    {
        try { return pattern.Match(raw).Groups[1].Value.Trim(); }
        catch (RegexMatchTimeoutException) { return ""; }
    }
    // Embedded lyrics get the same 8 MB guard as lyric files, so a hostile tag cannot push an enormous string through the bridge.
    private static string EmbeddedLyrics(string? text)
    {
        if (string.IsNullOrEmpty(text)) return "";
        if (Encoding.UTF8.GetByteCount(text) > MaximumTextBytes) throw new IOException("歌词文件超过 8 MB");
        return text;
    }
    // Embedded artwork is untrusted tag data: only known raster image types become a data URL, otherwise the cover stays empty.
    private static string CoverDataUrl(ReadOnlySpan<byte> bytes, string? declared)
    {
        var type = CoverMimeType(bytes, declared);
        return bytes.Length == 0 || type.Length == 0 ? "" : $"data:{type};base64,{Convert.ToBase64String(bytes)}";
    }
    // The image bytes decide the media type (as CoverImage does); a declared type is trusted only when it is one of the allowed raster types.
    private static string CoverMimeType(ReadOnlySpan<byte> bytes, string? declared)
    {
        if (bytes.Length >= 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff) return "image/jpeg";
        if (bytes.StartsWith((ReadOnlySpan<byte>)[137, 80, 78, 71, 13, 10, 26, 10])) return "image/png";
        if (bytes.StartsWith("GIF87a"u8) || bytes.StartsWith("GIF89a"u8)) return "image/gif";
        if (bytes.Length >= 12 && bytes.StartsWith("RIFF"u8) && bytes[8..].StartsWith("WEBP"u8)) return "image/webp";
        if (bytes.Length >= 14 && bytes.StartsWith("BM"u8)) return "image/bmp";
        return declared?.Split([',', ';'], 2)[0].Trim().ToLowerInvariant() switch
        {
            "image/jpeg" or "image/jpg" or "image/pjpeg" => "image/jpeg",
            "image/png" or "image/x-png" => "image/png",
            "image/gif" => "image/gif",
            "image/webp" => "image/webp",
            "image/bmp" or "image/x-ms-bmp" => "image/bmp",
            _ => "",
        };
    }
    private static string ReadText(string path)
    {
        if (new FileInfo(path).Length > MaximumTextBytes) throw new IOException("歌词文件超过 8 MB");
        var bytes = File.ReadAllBytes(path);
        if (bytes.Length >= 2 && bytes[0] == 0xff && bytes[1] == 0xfe) return Encoding.Unicode.GetString(bytes, 2, bytes.Length - 2);
        if (bytes.Length >= 2 && bytes[0] == 0xfe && bytes[1] == 0xff) return Encoding.BigEndianUnicode.GetString(bytes, 2, bytes.Length - 2);
        try { return new UTF8Encoding(false, true).GetString(bytes).TrimStart('\ufeff'); }
        catch (DecoderFallbackException) { return Encoding.GetEncoding(936).GetString(bytes); }
    }
}
