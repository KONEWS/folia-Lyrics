using FoliaLyrics;

// test/music-app-smoke/SteamDiscoveryChecks.cs — offline Steam multi-library discovery and manifest boundaries.
internal static class SteamDiscoveryChecks
{
    internal static void Run(Action<bool, string> check, string directory)
    {
        var fixture = Path.GetFullPath(Path.Combine(directory, "steam-fixture"));
        if (!fixture.StartsWith(Path.GetFullPath(directory) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Steam fixture must remain in its temporary test directory.");
        var root = Path.Combine(fixture, "Steam");
        var library = Path.Combine(fixture, "Other Library");
        var steamApps = Path.Combine(library, "steamapps");
        var playerDirectory = Path.Combine(steamApps, "common", "ECHO");
        var executable = Path.Combine(playerDirectory, "ECHO.exe");
        var manifest = Path.Combine(steamApps, "appmanifest_5105090.acf");
        Directory.CreateDirectory(Path.Combine(root, "steamapps"));
        Directory.CreateDirectory(playerDirectory);
        try
        {
            File.WriteAllText(Path.Combine(root, "steamapps", "libraryfolders.vdf"),
                "\"libraryfolders\" { \"0\" { \"path\" \"" + library.Replace("\\", "\\\\") + "\" } \"1\" { \"path\" \"\\\\\\\\server\\\\games\" } }");
            File.WriteAllBytes(executable, []);
            File.WriteAllText(manifest, "\"AppState\" { \"appid\" \"5105090\" \"installdir\" \"ECHO\" }");
            var found = MusicAppSteamPaths.Read([root, root.ToUpperInvariant()], CancellationToken.None).ToArray();
            check(found.SequenceEqual([executable]), "Steam discovers ECHO once in a separate library with escaped paths and spaces");
            check(MusicAppCatalog.Identify(executable, "ECHO ECHO")?.Name == "ECHO"
                && MusicAppCatalog.Identify(executable) is null && MusicAppCatalog.Identify(executable, "Unrelated utility") is null,
                "ECHO process discovery requires matching music-player product metadata");
            foreach (var unsafeFolder in new[] { "..", "../ECHO", @"..\ECHO", @"C:\ECHO", @"\\server\ECHO" })
            {
                File.WriteAllText(manifest, "\"appid\" \"5105090\" \"installdir\" \"" + unsafeFolder.Replace("\\", "\\\\") + "\"");
                check(!MusicAppSteamPaths.Read([root], CancellationToken.None).Any(), "Steam rejects install directory outside common: " + unsafeFolder);
            }
            File.WriteAllText(manifest, "\"appid\" \"999\" \"installdir\" \"ECHO\"");
            check(!MusicAppSteamPaths.Read([root], CancellationToken.None).Any(), "Steam ignores mismatched application IDs");
            File.WriteAllText(manifest, "\"appid\" \"5105090\" \"installdir\" \"ECHO\"");
            File.Delete(executable);
            check(!MusicAppSteamPaths.Read([root], CancellationToken.None).Any(), "Steam ignores uninstalled or incomplete player executables");
            File.WriteAllText(manifest, new string('x', 1024 * 1024 + 1));
            check(!MusicAppSteamPaths.Read([root], CancellationToken.None).Any(), "Steam bounds malformed manifest reads");
        }
        finally { Directory.Delete(fixture, recursive: true); }
    }
}

namespace FoliaLyrics
{
    // Smoke checks retain original exceptions without writing to the user's application data.
    internal static class DataFiles
    {
        internal static void Log(Exception error) => Console.Error.WriteLine(error);
    }
}
