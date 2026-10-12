using System.Diagnostics;

// native/MusicAppDiscovery.cs — discovers known players off the UI thread and reads metadata only for new paths.
namespace FoliaLyrics;
internal static class MusicAppDiscovery
{
    // Installation reads run only at startup/manual scan; periodic scans classify new known-player process identities.
    internal static async Task<MusicAppScan> ScanAsync(bool installed, IEnumerable<string> ignoredIds, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        var ignored = new HashSet<string>(ignoredIds, StringComparer.OrdinalIgnoreCase);
        var running = MusicAppRunningProcesses.Read(token);
        var runningInstances = running.GroupBy(app => MusicAppDiscoveryPolicy.Id(new(0, "", app.Path, "",
                app.AppUserModelId.Length > 0 ? "store" : "exe", app.AppUserModelId)))
            .ToDictionary(group => group.Key, group => string.Join("|", group.Select(app => app.Instance).Order(StringComparer.Ordinal)));
        var candidates = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (installed) candidates.UnionWith(MusicAppInstalledPaths.Read(token));
        candidates.UnionWith(running.Where(app => app.AppUserModelId.Length == 0).Select(app => app.Path));
        var result = FromPaths(candidates.Where(path => !ignored.Contains(MusicAppDiscoveryPolicy.Id(new(0, "", path, "")))), [], token).ToList();
        if (installed) result.AddRange(await MusicAppStore.FindAsync(ignored, token));
        else foreach (var appId in running.Select(app => app.AppUserModelId).Where(id => id.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            token.ThrowIfCancellationRequested();
            if (ignored.Contains(MusicAppDiscoveryPolicy.Id(new(0, "", "", "", "store", appId)))) continue;
            try
            {
                if (await MusicAppStore.ReadBindingAsync(appId, token) is { } binding) result.Add(binding);
            }
            catch (Exception error) when (error is not OperationCanceledException) { }
        }
        return new(result.DistinctBy(MusicAppDiscoveryPolicy.Id).ToArray(), runningInstances);
    }

    // Shared classification seam allows fixture paths to exercise the same validation/metadata pipeline as registry and processes.
    internal static MusicAppBinding[] FromPaths(IEnumerable<string> candidates, IEnumerable<string> ignoredPaths, CancellationToken token)
    {
        var seen = new HashSet<string>(ignoredPaths.Select(MusicAppDiscoveryPolicy.PathKey), StringComparer.OrdinalIgnoreCase);
        var result = new List<MusicAppBinding>();
        foreach (var candidate in candidates.Order(StringComparer.OrdinalIgnoreCase))
        {
            token.ThrowIfCancellationRequested();
            if (!seen.Add(MusicAppDiscoveryPolicy.PathKey(candidate)) || candidate.Contains("\\WindowsApps\\", StringComparison.OrdinalIgnoreCase)) continue;
            try
            {
                var path = MusicAppLauncher.ValidateExecutable(candidate);
                string? product = null;
                try { var info = FileVersionInfo.GetVersionInfo(path); product = info.ProductName + " " + info.FileDescription; }
                catch (Exception error) when (error is IOException or System.ComponentModel.Win32Exception or UnauthorizedAccessException) { }
                if (MusicAppCatalog.Identify(path, product) is not { } app) continue;
                result.Add(MusicAppLauncher.ReadBinding(0, path) with { Name = app.Name });
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException or System.ComponentModel.Win32Exception) { }
        }
        return result.ToArray();
    }
}

internal sealed record MusicAppScan(MusicAppBinding[] Candidates, IReadOnlyDictionary<string, string> RunningInstances);
