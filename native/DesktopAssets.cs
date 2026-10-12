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
        try { Extract(folder, openArchive); }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            // Antivirus scanners and indexers can briefly lock freshly written files; one short pause and a second attempt covers that.
            Thread.Sleep(250);
            Extract(folder, openArchive);
        }
        File.WriteAllText(marker, digest);
        return folder;
    }
    // Open a fresh archive stream and unpack it over the folder (one call per attempt, so a retry never reuses a consumed stream).
    private static void Extract(string folder, Func<Stream> openArchive)
    {
        using var stream = openArchive();
        using var archive = new ZipArchive(stream, ZipArchiveMode.Read);
        archive.ExtractToDirectory(folder, true);
    }
    // Best-effort cleanup of the web/<digest> folders that earlier builds left behind. Only direct children of <root>/web whose
    // name has the 16-hex-digit digest format are candidates; the current folder and link/junction entries are never touched
    // and every failure (locked files, missing directory) is ignored.
    public static void RemoveStale(string root, string currentFolder)
    {
        try
        {
            var web = Path.GetFullPath(Path.Combine(root, "web"));
            var current = Path.GetFileName(Path.TrimEndingDirectorySeparator(Path.GetFullPath(currentFolder)));
            foreach (var directory in Directory.EnumerateDirectories(web))
            {
                try
                {
                    var name = Path.GetFileName(directory);
                    if (name.Length != 16 || !name.All(Uri.IsHexDigit) || name.Equals(current, StringComparison.OrdinalIgnoreCase)) continue;
                    if (!string.Equals(Path.GetDirectoryName(Path.GetFullPath(directory)), web, StringComparison.OrdinalIgnoreCase)) continue;
                    if ((File.GetAttributes(directory) & FileAttributes.ReparsePoint) != 0) continue;
                    Directory.Delete(directory, true);
                }
                catch { }
            }
        }
        catch { }
    }
}
