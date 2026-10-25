using System.Globalization;

// native/VideoLayerFileStore.cs — only a native file-picker grant becomes a streamed video resource.
namespace FoliaLyrics;
internal static class VideoLayerFileStore
{
    internal const string FileName = "video-layer.json";
    internal static string ContentType(string path) => Path.GetExtension(path).ToLowerInvariant() switch
    {
        ".mp4" or ".m4v" => "video/mp4", ".webm" => "video/webm", ".mov" => "video/quicktime",
        ".mkv" => "video/x-matroska", ".ogv" => "video/ogg", _ => ""
    };

    // One byte range is enough for media seeking; reject ambiguous or unsatisfiable requests.
    internal static bool TryRange(string? value, long length, out long start, out long count)
    {
        start = 0; count = length;
        if (length <= 0) return false;
        if (string.IsNullOrEmpty(value)) return true;
        if (!value.StartsWith("bytes=", StringComparison.OrdinalIgnoreCase) || value.Contains(',')) return false;
        var parts = value[6..].Split('-');
        if (parts.Length != 2) return false;
        static bool Number(string text, out long number) => long.TryParse(text, NumberStyles.None, CultureInfo.InvariantCulture, out number);
        if (parts[0].Length == 0)
        {
            if (!Number(parts[1], out var suffix) || suffix <= 0) return false;
            count = Math.Min(suffix, length); start = length - count; return true;
        }
        if (!Number(parts[0], out start) || start >= length) return false;
        var end = length - 1;
        if (parts[1].Length > 0 && (!Number(parts[1], out end) || end < start)) return false;
        count = Math.Min(end, length - 1) - start + 1;
        return true;
    }
}
