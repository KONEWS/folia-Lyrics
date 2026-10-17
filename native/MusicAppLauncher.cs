using System.Diagnostics;
using System.Text.Json;

// native/MusicAppLauncher.cs — validates saved executable bindings and reads their display metadata.
namespace FoliaLyrics;
internal static class MusicAppLauncher
{
    internal static int ReadSlot(JsonElement command)
    {
        if (command.ValueKind != JsonValueKind.Object || !command.TryGetProperty("value", out var value)
            || value.ValueKind != JsonValueKind.Number || !value.TryGetInt32(out var slot) || slot is < 0 or int.MaxValue)
            throw new IOException("请选择有效的音乐软件快捷位。");
        return slot;
    }

    internal static MusicAppBinding[] NormalizeBindings(IEnumerable<MusicAppBinding?>? bindings) =>
        (bindings ?? []).Where(app => app is { Slot: >= 0 and < int.MaxValue } && MusicAppDiscoveryPolicy.HasIdentity(app))
            .Select(app => app! with { LaunchKind = app!.LaunchKind == "store" ? "store" : "exe",
                Path = app.LaunchKind == "store" ? "" : app.Path, AppUserModelId = app.LaunchKind == "store" ? app.AppUserModelId : "",
                Icon = MusicAppIcon.Normalize(app.Icon) })
            .DistinctBy(app => app.Slot).OrderBy(app => app.Slot).ToArray();

    // Apply an extracted Store icon only to the same saved shortcut, preserving all user-visible binding metadata.
    internal static MusicAppBinding[] ApplyRefreshedStoreIcons(MusicAppBinding[] bindings, IReadOnlyDictionary<int, MusicAppBinding> refreshed)
    {
        MusicAppBinding[]? updated = null;
        for (var index = 0; index < bindings.Length; index++)
        {
            var app = bindings[index];
            if (app.LaunchKind != "store" || !refreshed.TryGetValue(app.Slot, out var current)
                || current.LaunchKind != "store"
                || !app.AppUserModelId.Equals(current.AppUserModelId, StringComparison.OrdinalIgnoreCase)
                || !current.Icon.StartsWith("data:image/png;base64,", StringComparison.Ordinal)
                || app.Icon == current.Icon) continue;
            updated ??= bindings.ToArray();
            updated[index] = app with { Icon = current.Icon };
        }
        return updated ?? bindings;
    }

    // Reuse the first gap without renumbering saved bindings or overflowing large persisted identities.
    internal static int NextSlot(IEnumerable<MusicAppBinding?>? bindings)
    {
        var next = 0;
        foreach (var app in NormalizeBindings(bindings))
        {
            if (app.Slot != next) break;
            if (++next == int.MaxValue) throw new IOException("没有可用的音乐软件快捷位。");
        }
        return next;
    }

    // Keep the full executable path separate from arguments; reject shell syntax, remote and device paths.
    internal static string ValidateExecutable(string? path)
    {
        if (string.IsNullOrWhiteSpace(path) || path.Length < 4 || !char.IsAsciiLetter(path[0]) || path[1] != ':'
            || path[2] is not ('\\' or '/') || path.AsSpan(2).Contains(':') || !Path.IsPathFullyQualified(path)
            || path.IndexOfAny(Path.GetInvalidPathChars()) >= 0)
            throw new IOException("请选择本机上的音乐软件 .exe 文件。");
        var fullPath = Path.GetFullPath(path);
        if (!Path.GetExtension(fullPath).Equals(".exe", StringComparison.OrdinalIgnoreCase))
            throw new IOException("请选择音乐软件的 .exe 文件，不支持快捷方式或启动命令。");
        if (!File.Exists(fullPath)) throw new IOException("找不到已绑定的音乐软件，请在设置中重新选择 .exe 文件。");
        return fullPath;
    }

    // Metadata failure should never prevent a valid executable from being bound.
    internal static MusicAppBinding ReadBinding(int slot, string path)
    {
        if (slot is < 0 or int.MaxValue) throw new IOException("请选择有效的音乐软件快捷位。");
        path = ValidateExecutable(path);
        var name = Path.GetFileNameWithoutExtension(path);
        try
        {
            var version = FileVersionInfo.GetVersionInfo(path);
            var description = string.IsNullOrWhiteSpace(version.ProductName) ? version.FileDescription : version.ProductName;
            if (!string.IsNullOrWhiteSpace(description)) name = description.Trim();
        }
        catch (Exception) { }
        if (name.Length > 100) name = name[..100];
        var icon = "";
        try
        {
            using var extracted = Icon.ExtractAssociatedIcon(path);
            if (extracted is not null)
            {
                using var bitmap = extracted.ToBitmap();
                icon = MusicAppIcon.Encode(bitmap);
            }
        }
        catch (Exception) { }
        return new(slot, name, path, icon);
    }

    internal static MusicAppBinding Resolve(IEnumerable<MusicAppBinding?>? bindings, int slot)
    {
        if (slot is < 0 or int.MaxValue) throw new IOException("请选择有效的音乐软件快捷位。");
        return NormalizeBindings(bindings).FirstOrDefault(app => app.Slot == slot)
            ?? throw new IOException("请先在设置中绑定这个快捷位的音乐软件。");
    }

    internal static ProcessStartInfo CreateStartInfo(MusicAppBinding binding)
    {
        if (binding.LaunchKind == "store") throw new IOException("商店应用需要通过 Windows 应用入口打开。");
        var path = ValidateExecutable(binding.Path);
        return new ProcessStartInfo(path) { UseShellExecute = true, WorkingDirectory = Path.GetDirectoryName(path)! };
    }

    internal static async Task LaunchAsync(MusicAppBinding binding, CancellationToken token)
    {
        if (binding.LaunchKind == "store") { await MusicAppStore.LaunchAsync(binding.AppUserModelId, token); return; }
        token.ThrowIfCancellationRequested();
        using var process = Process.Start(CreateStartInfo(binding));
    }
}
