using System.IO.Compression;

// native/DesktopAssets.cs — use the build-time digest to avoid reading the archive on warm starts.
namespace FoliaLyrics;
internal static class DesktopAssets
{
    // The archive is only opened for a missing/incomplete cache; the marker follows successful extraction.
    public static string Resolve(string root, string digest, Func<Stream> openArchive)
    {
        if (digest.Length != 64 || !digest.All(Uri.IsHexDigit)) throw new IOException("界面资源版本无效");
        var folder = Path.Combine(root, "web", digest[..16]);
        var marker = Path.Combine(folder, ".ready");
        if (File.Exists(marker) && File.Exists(Path.Combine(folder, "desktop.html"))
            && File.ReadAllText(marker) == digest) return folder;
        Directory.CreateDirectory(folder);
        File.Delete(marker);
        using var stream = openArchive();
        using var archive = new ZipArchive(stream, ZipArchiveMode.Read);
        archive.ExtractToDirectory(folder, true);
        File.WriteAllText(marker, digest);
        return folder;
    }
}
