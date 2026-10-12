using System.Security.Cryptography;
using System.Text;

// native/MusicAppDiscoveryPolicy.cs — stable executable/package identities and explicit block-list normalization.
namespace FoliaLyrics;
internal static class MusicAppDiscoveryPolicy
{
    internal static string PathKey(string? path)
    {
        if (string.IsNullOrWhiteSpace(path)) return "";
        try { return Path.GetFullPath(path).Replace('/', '\\'); }
        catch (Exception error) when (error is ArgumentException or NotSupportedException or PathTooLongException) { return path.Replace('/', '\\'); }
    }
    internal static bool ValidAppUserModelId(string? value)
    {
        if (value is not { Length: > 3 and <= 255 }) return false;
        var split = value.IndexOf('!');
        return split > 1 && split == value.LastIndexOf('!') && split < value.Length - 1 && value[..split].LastIndexOf('_') > 0
            && value.All(character => char.IsAsciiLetterOrDigit(character) || character is '.' or '_' or '-' or '!');
    }

    internal static bool HasIdentity(MusicAppBinding app) => app.LaunchKind == "store" ? ValidAppUserModelId(app.AppUserModelId)
        : (app.LaunchKind is null or "" or "exe") && !string.IsNullOrWhiteSpace(app.Path);
    internal static string Key(MusicAppBinding app) => app.LaunchKind == "store" ? "store:" + app.AppUserModelId : "exe:" + PathKey(app.Path);
    internal static string Id(MusicAppBinding app) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(Key(app).ToUpperInvariant())));
    internal static MusicAppCandidate Candidate(MusicAppBinding app) => new(Id(app), app.Name, app.LaunchKind == "store" ? "" : app.Path, app.Icon,
        app.LaunchKind == "store" ? "store" : "exe", app.LaunchKind == "store" ? app.AppUserModelId : "");
    internal static MusicAppBinding Binding(MusicAppCandidate app, int slot = 0) => new(slot, app.Name, app.Path, app.Icon, app.LaunchKind, app.AppUserModelId);

    internal static MusicAppCandidate[] NormalizeBlocked(IEnumerable<MusicAppCandidate?>? blocked) => (blocked ?? [])
        .Where(app => app is not null && HasIdentity(Binding(app)))
        .Select(app => Candidate(MusicAppLauncher.NormalizeBindings([Binding(app!)]).Single()))
        .DistinctBy(app => app.Id).ToArray();

    // Confirmation reuses free slots and preserves saved names, icons and identities; scans never call this directly.
    internal static MusicAppBinding[] Merge(IEnumerable<MusicAppBinding?>? existing, IEnumerable<MusicAppBinding> found, IEnumerable<string>? excluded)
    {
        var result = MusicAppLauncher.NormalizeBindings(existing).ToList();
        var seen = new HashSet<string>(result.Select(Key), StringComparer.OrdinalIgnoreCase);
        var blocked = new HashSet<string>(excluded ?? [], StringComparer.OrdinalIgnoreCase);
        foreach (var app in found)
        {
            if (!HasIdentity(app) || blocked.Contains(Id(app)) || !seen.Add(Key(app))) continue;
            result.Add(app with { Slot = MusicAppLauncher.NextSlot(result) });
        }
        return result.OrderBy(app => app.Slot).ToArray();
    }
}
