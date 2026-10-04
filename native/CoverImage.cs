// native/CoverImage.cs — normalize native artwork before passing its data URL to the WebView.
namespace FoliaLyrics;
internal static class CoverImage
{
    public const int MaximumBytes = 4_000_000;

    // A short read is incomplete artwork, not a successful cover that can be cached indefinitely.
    public static async Task<string> Read(Stream stream, long size, string? contentType, CancellationToken token = default)
    {
        if (size is <= 0 or > MaximumBytes) return "";
        var bytes = new byte[(int)size];
        await stream.ReadExactlyAsync(bytes, token);
        return ToDataUrl(bytes, contentType);
    }

    public static string ToDataUrl(ReadOnlySpan<byte> bytes, string? contentType)
    {
        if (bytes.Length is 0 or > MaximumBytes) return "";
        var type = MimeType(bytes, contentType);
        return type.Length == 0 ? "" : $"data:{type};base64,{Convert.ToBase64String(bytes)}";
    }

    // Some SMTC players return comma-separated MIME aliases; a data URL needs exactly one media type.
    private static string MimeType(ReadOnlySpan<byte> bytes, string? contentType)
    {
        if (bytes.Length >= 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff) return "image/jpeg";
        if (bytes.StartsWith(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 })) return "image/png";
        if (bytes.StartsWith("GIF87a"u8) || bytes.StartsWith("GIF89a"u8)) return "image/gif";
        if (bytes.Length >= 12 && bytes.StartsWith("RIFF"u8) && bytes[8..].StartsWith("WEBP"u8)) return "image/webp";
        if (bytes.Length >= 14 && bytes.StartsWith("BM"u8)) return "image/bmp";
        if (bytes.Length >= 6 && bytes.StartsWith(new byte[] { 0, 0, 1, 0 })) return "image/x-icon";
        var declared = contentType?.Split([',', ';'], 2)[0].Trim().ToLowerInvariant();
        return declared switch
        {
            "image/jpeg" or "image/jpg" or "image/jpe" or "image/pjpeg" => "image/jpeg",
            "image/png" or "image/x-png" => "image/png",
            "image/gif" => "image/gif",
            "image/bmp" or "image/x-ms-bmp" => "image/bmp",
            "image/webp" => "image/webp",
            "image/avif" => "image/avif",
            "image/svg+xml" => "image/svg+xml",
            "image/x-icon" or "image/vnd.microsoft.icon" => "image/x-icon",
            _ => "",
        };
    }
}
