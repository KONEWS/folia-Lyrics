using Microsoft.Win32;

// native/MusicAppInstalledPaths.cs — reads installed-app registrations and known folders without a disk-wide scan.
namespace FoliaLyrics;
internal static class MusicAppInstalledPaths
{
    internal static IEnumerable<string> Read(CancellationToken token)
    {
        var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var hive in new[] { RegistryHive.CurrentUser, RegistryHive.LocalMachine })
        foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
        {
            token.ThrowIfCancellationRequested();
            try
            {
                using var root = RegistryKey.OpenBaseKey(hive, view);
                using var appPaths = root.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths");
                foreach (var name in MusicAppCatalog.ExecutableNames)
                {
                    using var app = appPaths?.OpenSubKey(name);
                    Add(app?.GetValue("") as string, result);
                }
                using var uninstall = root.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall");
                foreach (var name in uninstall?.GetSubKeyNames() ?? [])
                {
                    token.ThrowIfCancellationRequested();
                    try
                    {
                        using var app = uninstall!.OpenSubKey(name);
                        var display = app?.GetValue("DisplayName") as string;
                        var definition = MusicAppCatalog.Apps.FirstOrDefault(item => MusicAppCatalog.Matches(display, item));
                        var location = LocalFolder(app?.GetValue("InstallLocation") as string);
                        if (definition is not null && location is not null) AddFolder(location, definition, result);
                        // DisplayIcon may be the executable when InstallLocation is absent; never use UninstallString.
                        if (definition is not null) Add(app?.GetValue("DisplayIcon") as string, result, icon: true);
                    }
                    catch (Exception error) when (error is System.Security.SecurityException or UnauthorizedAccessException or IOException) { }
                }
            }
            catch (Exception error) when (error is System.Security.SecurityException or UnauthorizedAccessException or IOException) { }
        }
        var roots = new[] { Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs"),
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData) };
        foreach (var root in roots.Where(root => LocalFolder(root) is not null).Distinct(StringComparer.OrdinalIgnoreCase))
        foreach (var app in MusicAppCatalog.Apps)
        foreach (var location in app.Locations)
        {
            token.ThrowIfCancellationRequested();
            AddFolder(Path.Combine(root, location), app, result);
        }
        return result;
    }

    private static void AddFolder(string folder, MusicAppDefinition app, HashSet<string> result)
    {
        foreach (var executable in app.Executables)
        {
            Add(Path.Combine(folder, executable), result);
            Add(Path.Combine(folder, "bin", executable), result);
        }
    }
    // Accept only whole local executable paths; optional icon-index suffixes are data, never launch arguments.
    internal static string? RegisteredExecutable(string? value, bool icon = false)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var path = Environment.ExpandEnvironmentVariables(value.Trim());
        if (icon)
        {
            var comma = path.LastIndexOf(',');
            if (comma >= 0 && int.TryParse(path[(comma + 1)..].Trim(), out _)) path = path[..comma].TrimEnd();
        }
        if (path.Length > 1 && path[0] == '"' && path[^1] == '"') path = path[1..^1];
        try { return MusicAppLauncher.ValidateExecutable(path); }
        catch (IOException) { return null; }
    }
    private static void Add(string? value, HashSet<string> result, bool icon = false)
    {
        var path = RegisteredExecutable(value, icon);
        if (path is not null) result.Add(path);
    }
    private static string? LocalFolder(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var path = Environment.ExpandEnvironmentVariables(value.Trim().Trim('"'));
        return path.Length > 2 && char.IsAsciiLetter(path[0]) && path[1] == ':' && path[2] is '\\' or '/'
            && Path.IsPathFullyQualified(path) && !path.AsSpan(2).Contains(':') ? path : null;
    }
}
