using System.Text.Json;
using FoliaLyrics;

// test/music-app-smoke/Program.cs — validates shortcut persistence and exact-path launch policy without launching apps.
var checks = 0;
void Check(bool condition, string label)
{
    if (!condition) throw new Exception(label);
    checks++; Console.WriteLine("PASS " + label);
}
void Reject(Action action, string label)
{
    try { action(); }
    catch (IOException) { checks++; Console.WriteLine("PASS " + label); return; }
    throw new Exception(label);
}
var json = new JsonSerializerOptions(JsonSerializerDefaults.Web);
IconChecks.Run(Check);
var legacy = JsonSerializer.Deserialize<Preferences>("{\"topmost\":true,\"source\":\"salt\",\"immersiveDelay\":5}", json)!;
Check(legacy.MusicApps.Length == 0 && legacy.ShowMusicAppAddButton && legacy.Topmost && legacy.Source == "salt" && legacy.ImmersiveDelay == 5,
    "legacy preferences default to empty shortcuts and a visible add button without changing existing settings");
foreach (var slot in new[] { 0, 1, 2, 4, int.MaxValue - 1 })
{
    using var command = JsonDocument.Parse($"{{\"type\":\"launchMusicApp\",\"value\":{slot}}}");
    Check(MusicAppLauncher.ReadSlot(command.RootElement) == slot, "valid integer slot " + slot);
}
foreach (var invalid in new[] { "{}", "null", "[]", "0", "{\"value\":-1}", "{\"value\":2147483647}", "{\"value\":0.5}", "{\"value\":\"0\"}", "{\"value\":true}", "{\"value\":null}", "{\"value\":2147483648}", "{\"value\":{\"path\":\"C:\\\\player.exe\"}}" })
{
    using var command = JsonDocument.Parse(invalid);
    Reject(() => MusicAppLauncher.ReadSlot(command.RootElement), "invalid slot payload " + invalid);
}
foreach (var path in new[] { "", "player.exe", "C:player.exe", @"\player.exe", @"\\server\share\player.exe", @"\\?\C:\player.exe", @"\\.\C:\player.exe", "https://example.test/player.exe", "music:play", @"C:\player.exe --play", "\"C:\\player.exe\"", @"C:\player.cmd", @"C:\player.exe:payload.exe" })
    Reject(() => MusicAppLauncher.ValidateExecutable(path), "unsafe or unsupported path " + path);

var executableMetadata = MusicAppLauncher.ReadBinding(0, Environment.ProcessPath!);
Check(!string.IsNullOrWhiteSpace(executableMetadata.Name), "compiled test executable provides a display name");
Check(executableMetadata.Icon.StartsWith("data:image/png;base64,", StringComparison.Ordinal), "real executable icon extraction returns embedded PNG data");
var iconBytes = Convert.FromBase64String(executableMetadata.Icon["data:image/png;base64,".Length..]);
Check(iconBytes.AsSpan().StartsWith(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }), "extracted executable icon has a valid PNG signature");

var directory = Path.Combine(Path.GetTempPath(), "FoliaLyricsMusicAppSmoke_" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(directory);
var executable = Path.Combine(directory, "Example Music Player.EXE");
var preferencesPath = Path.Combine(directory, "preferences.json");
try
{
    File.WriteAllBytes(executable, []);
    DiscoveryChecks.Run(Check, directory);
    var binding = MusicAppLauncher.ReadBinding(1, executable);
    StoreBindingChecks.Run(Check, Reject, json, binding);
    InboxChecks.Run(Check, Reject, json, binding);
    Check(binding.Slot == 1 && binding.Path == executable && binding.Name == "Example Music Player", "missing file metadata falls back to the executable name");
    Check(binding.Icon.Length == 0 || binding.Icon.StartsWith("data:image/png;base64,", StringComparison.Ordinal), "icon is absent or an embedded PNG");
    var start = MusicAppLauncher.CreateStartInfo(binding);
    Check(start.FileName == executable && start.WorkingDirectory == directory && start.UseShellExecute
        && start.Arguments.Length == 0 && start.ArgumentList.Count == 0, "spaces stay in the exact filename, with no arguments and the app working directory");
    legacy.MusicApps = [binding, binding with { Slot = 0, Name = "Other player" }];
    File.WriteAllText(preferencesPath, JsonSerializer.Serialize(legacy, json));
    var loaded = JsonSerializer.Deserialize<Preferences>(File.ReadAllText(preferencesPath), json)!;
    Check(loaded.MusicApps.SequenceEqual(legacy.MusicApps) && loaded.Topmost && loaded.Source == "salt" && loaded.ImmersiveDelay == 5,
        "two slots round-trip through preferences without changing unrelated settings");
    using (var payload = JsonDocument.Parse(File.ReadAllText(preferencesPath)))
        Check(payload.RootElement.GetProperty("musicApps")[0].GetProperty("path").GetString() == executable,
            "bridge contract serializes camel-case musicApps and binding fields");
    var oldBindings = JsonSerializer.Deserialize<Preferences>(JsonSerializer.Serialize(new { musicApps = legacy.MusicApps }, json), json)!;
    Check(oldBindings.ShowMusicAppAddButton && oldBindings.MusicApps.SequenceEqual(legacy.MusicApps),
        "old two-slot preferences keep both bindings and default the new add-button preference to visible");
    var normalized = MusicAppLauncher.NormalizeBindings([null, binding, binding with { Name = "Duplicate" }, binding with { Slot = 7 }, binding with { Slot = 0 }, binding with { Slot = 2 }, binding with { Slot = 4 }, binding with { Slot = int.MaxValue - 1 }, binding with { Slot = int.MaxValue }, binding with { Slot = -1 }, binding with { Slot = 3, Path = "" }]);
    Check(normalized.Select(app => app.Slot).SequenceEqual(new[] { 0, 1, 2, 4, 7, int.MaxValue - 1 }) && normalized[1] == binding,
        "normalization preserves six valid identities while dropping malformed and duplicate entries");
    Check(MusicAppLauncher.NormalizeBindings(null).Length == 0, "null saved bindings normalize to an empty list");
    Check(MusicAppLauncher.NextSlot(null) == 0, "empty preferences allocate the first identity");
    MusicAppBinding[] expanded = [];
    for (var i = 0; i < 5; i++) expanded = [.. expanded, binding with { Slot = MusicAppLauncher.NextSlot(expanded), Name = "Player " + i }];
    Check(expanded.Select(app => app.Slot).SequenceEqual(new[] { 0, 1, 2, 3, 4 }) && MusicAppLauncher.NextSlot(expanded) == 5,
        "adding five players grows beyond the old limit");
    var gaps = expanded.Where(app => app.Slot is not (1 or 3)).ToArray();
    Check(gaps.Select(app => app.Slot).SequenceEqual(new[] { 0, 2, 4 }) && MusicAppLauncher.NextSlot(gaps) == 1,
        "removing entries retains surviving identities and reuses the smallest gap");
    gaps = [.. gaps, binding with { Slot = MusicAppLauncher.NextSlot(gaps) }];
    Check(MusicAppLauncher.NextSlot(gaps) == 3, "filling the first gap makes the next gap available");
    Check(MusicAppLauncher.NextSlot([binding with { Slot = int.MaxValue - 1 }]) == 0,
        "large persisted identities do not force huge allocations or overflow the next identity");
    loaded.MusicApps = expanded;
    foreach (var showAddButton in new[] { false, true })
    {
        loaded.ShowMusicAppAddButton = showAddButton;
        File.WriteAllText(preferencesPath, JsonSerializer.Serialize(loaded, json));
        var reloaded = JsonSerializer.Deserialize<Preferences>(File.ReadAllText(preferencesPath), json)!;
        Check(reloaded.MusicApps.SequenceEqual(expanded) && reloaded.ShowMusicAppAddButton == showAddButton
            && reloaded.Topmost && reloaded.Source == "salt" && reloaded.ImmersiveDelay == 5,
            "five bindings and the add-button toggle round-trip without changing other preferences: " + showAddButton);
        using var payload = JsonDocument.Parse(File.ReadAllText(preferencesPath));
        Check(payload.RootElement.GetProperty("showMusicAppAddButton").GetBoolean() == showAddButton,
            "bridge serializes camel-case showMusicAppAddButton=" + showAddButton);
    }
    Check(MusicAppLauncher.Resolve(expanded, 4) == expanded[4], "launch resolves an existing identity beyond the former two-slot limit");
    loaded.MusicApps = legacy.MusicApps;
    Check(MusicAppLauncher.Resolve(loaded.MusicApps, 1) == binding, "launch resolves the requested persisted slot");
    Reject(() => MusicAppLauncher.Resolve([binding], 0), "unbound slot cannot launch");
    Reject(() => MusicAppLauncher.Resolve(expanded, 1000000), "unbound high identity cannot be used to replace or launch a saved app");
    Reject(() => MusicAppLauncher.Resolve(loaded.MusicApps, int.MaxValue), "overflow-prone identity cannot resolve a saved app");
    File.Delete(executable);
    Reject(() => MusicAppLauncher.CreateStartInfo(binding), "removed executables fail before process start");
}
finally
{
    if (File.Exists(executable)) File.Delete(executable);
    if (File.Exists(preferencesPath)) File.Delete(preferencesPath);
    Directory.Delete(directory);
}
Console.WriteLine($"{checks} music-app checks passed; no player was launched and no user preferences were changed.");
if (args is ["--normalize-icon", var inputIcon, var outputIcon]) IconChecks.NormalizeFixture(inputIcon, outputIcon);
if (args.Contains("--read-only-discovery"))
{
    using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
    var started = System.Diagnostics.Stopwatch.StartNew();
    var scan = await MusicAppDiscovery.ScanAsync(true, [], timeout.Token);
    var found = scan.Candidates;
    Console.WriteLine(JsonSerializer.Serialize(new { mode = "read-only-installed-and-running", count = found.Length,
        apps = found.Select(app => new { app.Name, app.LaunchKind, app.Path, app.AppUserModelId, hasPngIcon = app.Icon.StartsWith("data:image/png;base64,", StringComparison.Ordinal) }),
        elapsedMs = started.ElapsedMilliseconds, preferencesWritten = false, applicationsLaunched = false }, json));
}
