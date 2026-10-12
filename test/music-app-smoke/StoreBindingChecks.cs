using System.Text.Json;
using FoliaLyrics;

// test/music-app-smoke/StoreBindingChecks.cs — validates legacy migration and Store identities without activating applications.
internal static class StoreBindingChecks
{
    internal static void Run(Action<bool, string> check, Action<Action, string> reject, JsonSerializerOptions json, MusicAppBinding executable)
    {
        const string saltId = "Sakawish.SaltPlayerforWindows_q65q631pyh094!SaltPlayerforWindows";
        var store = new MusicAppBinding(9, "My Salt", @"C:\Program Files\WindowsApps\old-version\stub.exe", "saved-store-icon", "store", saltId);
        var normalized = MusicAppLauncher.NormalizeBindings([store]).Single();
        check(normalized.Path == "" && normalized.AppUserModelId == saltId && normalized.Slot == 9 && normalized.Name == store.Name && normalized.Icon == store.Icon,
            "Store normalization removes versioned paths and preserves slot/name/icon/AUMID");
        check(MusicAppDiscoveryPolicy.Candidate(store).Path == "", "Store candidates never expose a versioned executable path");
        check(MusicAppDiscoveryPolicy.Id(normalized) == MusicAppDiscoveryPolicy.Id(store with { AppUserModelId = saltId.ToUpperInvariant(), Path = "different" }),
            "Store identity is case-insensitive and independent of executable versions");
        check(MusicAppDiscoveryPolicy.Id(executable) != MusicAppDiscoveryPolicy.Id(normalized), "exe and Store identities remain distinct");
        check(MusicAppDiscoveryPolicy.Id(executable) == MusicAppDiscoveryPolicy.Id(executable with { Path = executable.Path.Replace('\\', '/').ToUpperInvariant() }),
            "executable candidate IDs tolerate case and slash variants");
        foreach (var invalid in new string?[] { null, "", "player.exe", "Package!App", "Family_pub!", "Family_pub!App!extra", "Family_pub!App --play", "Family_pub!App/extra", new('a', 256) })
            check(!MusicAppDiscoveryPolicy.ValidAppUserModelId(invalid), "malformed Store AUMID is rejected: " + invalid);
        check(MusicAppLauncher.NormalizeBindings([store with { AppUserModelId = "broken" }, executable with { LaunchKind = "command" }]).Length == 0,
            "invalid Store identity and unsupported launch kind are dropped");
        reject(() => MusicAppLauncher.CreateStartInfo(normalized), "Store bindings cannot enter executable launch construction");
        var preferences = new Preferences { MusicApps = [executable, normalized], BlockedMusicApps = [MusicAppDiscoveryPolicy.Candidate(normalized)] };
        var restored = JsonSerializer.Deserialize<Preferences>(JsonSerializer.Serialize(preferences, json), json)!;
        check(restored.MusicApps.SequenceEqual(preferences.MusicApps) && restored.BlockedMusicApps.SequenceEqual(preferences.BlockedMusicApps),
            "Store bindings and explicit blocks round-trip without losing metadata");
        check(MusicAppDiscoveryPolicy.Merge(preferences.MusicApps, [store], preferences.BlockedMusicApps.Select(app => app.Id))
                .SequenceEqual(preferences.MusicApps.OrderBy(app => app.Slot)),
            "blocking an already bound Store app keeps its shortcut, slot and saved metadata");
        var oldJson = JsonSerializer.Serialize(new
        {
            topmost = true, source = "salt", autoDiscoverMusicApps = false,
            musicApps = new[] { new { executable.Slot, executable.Name, executable.Path, executable.Icon } },
            excludedAutoMusicAppPaths = new[] { executable.Path }
        }, json);
        var legacy = JsonSerializer.Deserialize<Preferences>(oldJson, json)!;
        check(legacy.MusicApps.Single() == executable && legacy.BlockedMusicApps.Length == 0 && legacy.ExcludedAutoMusicAppPaths.Length == 0
            && legacy.Topmost && legacy.Source == "salt" && !legacy.AutoDiscoverMusicApps,
            "old JSON keeps executable binding and unrelated preferences while retiring removal exclusions");
        using var serialized = JsonDocument.Parse(JsonSerializer.Serialize(legacy, json));
        check(!serialized.RootElement.TryGetProperty("excludedAutoMusicAppPaths", out _), "retired removal exclusions are omitted from saved JSON");
        var normalizedBlocks = MusicAppDiscoveryPolicy.NormalizeBlocked([
            MusicAppDiscoveryPolicy.Candidate(store) with { Id = "front-end-supplied-id" },
            MusicAppDiscoveryPolicy.Candidate(normalized),
            new("invalid", "Invalid", "", "", "store", "broken")]);
        check(normalizedBlocks.Length == 1 && normalizedBlocks[0].Id == MusicAppDiscoveryPolicy.Id(normalized) && normalizedBlocks[0].Path == "",
            "block normalization derives trusted IDs, clears Store paths, and drops duplicates/malformed entries");
    }
}
