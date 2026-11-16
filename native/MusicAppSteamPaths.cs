using System.Text.RegularExpressions;

// native/MusicAppSteamPaths.cs — reads local Steam library manifests for known music players only.
namespace FoliaLyrics;
internal static class MusicAppSteamPaths
{
    private static readonly Regex Pair = new("\"(?<key>[^\"\\\\]+)\"\\s*\"(?<value>(?:\\\\.|[^\"\\\\])*)\"", RegexOptions.CultureInvariant,
        TimeSpan.FromMilliseconds(100));

    internal static IEnumerable<string> Read(IEnumerable<string> steamRoots, CancellationToken token)
    {
        var libraries = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var root in steamRoots)
        {
            token.ThrowIfCancellationRequested();
            if (MusicAppInstalledPaths.LocalFolder(root) is not { } localRoot) continue;
            libraries.Add(localRoot);
            foreach (var (key, value) in ReadPairs(Path.Combine(localRoot, "steamapps", "libraryfolders.vdf")))
                if (key.Equals("path", StringComparison.OrdinalIgnoreCase) && MusicAppInstalledPaths.LocalFolder(value) is { } library)
                    libraries.Add(library);
        }
        var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var library in libraries)
        foreach (var app in MusicAppCatalog.Apps.Where(app => app.SteamAppId is not null))
        {
            token.ThrowIfCancellationRequested();
            var fields = ReadPairs(Path.Combine(library, "steamapps", $"appmanifest_{app.SteamAppId}.acf"));
            var appId = fields.FirstOrDefault(pair => pair.Key == "appid").Value;
            var folder = fields.FirstOrDefault(pair => pair.Key == "installdir").Value;
            // A manifest install directory is one local child of steamapps/common, never a path or launch command.
            if (appId != app.SteamAppId || string.IsNullOrWhiteSpace(folder) || folder is "." or ".."
                || folder.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0) continue;
            foreach (var executable in app.Executables)
                if (MusicAppInstalledPaths.RegisteredExecutable(Path.Combine(library, "steamapps", "common", folder, executable)) is { } path)
                    result.Add(path);
        }
        return result;
    }

    // Steam uses quoted KeyValues strings; cap reads and tolerate missing/unreadable manifests during installs.
    private static List<KeyValuePair<string, string>> ReadPairs(string path)
    {
        try
        {
            using var file = File.OpenRead(path);
            if (file.Length > 1024 * 1024) return [];
            using var reader = new StreamReader(file);
            var content = reader.ReadToEnd();
            return Pair.Matches(content).Select(match => KeyValuePair.Create(match.Groups["key"].Value,
                match.Groups["value"].Value.Replace(@"\\", @"\").Replace("\\\"", "\""))).ToList();
        }
        catch (Exception error) when (error is FileNotFoundException or DirectoryNotFoundException) { return []; }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or System.Security.SecurityException or RegexMatchTimeoutException)
        {
            DataFiles.Log(error);
            return [];
        }
    }
}
