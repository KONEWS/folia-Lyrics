// native/MediaDiagnostics.cs
namespace FoliaLyrics;
internal static class MediaDiagnostics
{
    private static readonly object gate = new();
    public static void Write(string message)
    {
        try
        {
            lock (gate)
            {
                Directory.CreateDirectory(DataFiles.Root);
                var path = Path.Combine(DataFiles.Root, "media.log");
                if (File.Exists(path) && new FileInfo(path).Length > 256_000) File.Move(path, path + ".previous", true);
                File.AppendAllText(path, $"{DateTime.Now:u} {message}\n");
            }
        }
        catch { }
    }
}
