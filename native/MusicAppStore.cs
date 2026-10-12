using System.Drawing.Imaging;
using Windows.ApplicationModel;
using Windows.ApplicationModel.Core;
using Windows.Management.Deployment;

// native/MusicAppStore.cs — resolve Store shortcuts through current-user package identities, never versioned install paths.
namespace FoliaLyrics;
internal static class MusicAppStore
{
    internal static async Task<MusicAppBinding[]> FindAsync(IEnumerable<string> ignoredIds, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        var ignored = new HashSet<string>(ignoredIds, StringComparer.OrdinalIgnoreCase);
        var result = new List<MusicAppBinding>();
        foreach (var package in new PackageManager().FindPackagesForUser(""))
        {
            token.ThrowIfCancellationRequested();
            try
            {
                if (package.IsFramework || package.IsResourcePackage
                    || MusicAppCatalog.IdentifyPackage(package.Id.Name, package.Id.FamilyName) is not { } definition) continue;
                foreach (var entry in await package.GetAppListEntriesAsync().AsTask(token))
                {
                    token.ThrowIfCancellationRequested();
                    if (!MusicAppDiscoveryPolicy.ValidAppUserModelId(entry.AppUserModelId)) continue;
                    var binding = new MusicAppBinding(0, definition.Name, "", "", "store", entry.AppUserModelId);
                    if (!ignored.Add(MusicAppDiscoveryPolicy.Id(binding))) continue;
                    result.Add(await ReadBinding(entry, definition, token));
                }
            }
            catch (Exception error) when (error is not OperationCanceledException) { }
        }
        return result.ToArray();
    }

    internal static async Task<MusicAppBinding?> ReadBindingAsync(string appUserModelId, CancellationToken token)
    {
        if (!MusicAppDiscoveryPolicy.ValidAppUserModelId(appUserModelId)) return null;
        var family = appUserModelId[..appUserModelId.IndexOf('!')];
        if (MusicAppCatalog.IdentifyPackage(family, family) is not { } definition) return null;
        return await ReadBinding(await ResolveAsync(appUserModelId, token), definition, token);
    }

    private static async Task<MusicAppBinding> ReadBinding(AppListEntry entry, MusicAppDefinition definition, CancellationToken token)
    {
        var name = entry.DisplayInfo.DisplayName;
        name = string.IsNullOrWhiteSpace(name) ? definition.Name : name.Trim();
        return new(0, name[..Math.Min(name.Length, 100)], "", await ReadIcon(entry, token), "store", entry.AppUserModelId);
    }

    // Re-resolve the AUMID at every launch so Store updates, stub executables and package relocation remain transparent.
    internal static async Task LaunchAsync(string appUserModelId, CancellationToken token)
    {
        var entry = await ResolveAsync(appUserModelId, token);
        if (!await entry.LaunchAsync().AsTask(token)) throw new IOException("Windows 未能打开这个商店应用，请确认它仍已安装。");
    }

    internal static async Task<AppListEntry> ResolveAsync(string appUserModelId, CancellationToken token)
    {
        if (!MusicAppDiscoveryPolicy.ValidAppUserModelId(appUserModelId)) throw new IOException("商店应用入口无效，请重新扫描并添加。");
        token.ThrowIfCancellationRequested();
        var family = appUserModelId[..appUserModelId.IndexOf('!')];
        foreach (var package in new PackageManager().FindPackagesForUser("", family))
        {
            token.ThrowIfCancellationRequested();
            foreach (var entry in await package.GetAppListEntriesAsync().AsTask(token))
                if (entry.AppUserModelId.Equals(appUserModelId, StringComparison.OrdinalIgnoreCase)) return entry;
        }
        throw new IOException("找不到已绑定的商店应用，请重新安装，或在设置中重新扫描。");
    }

    // Bound icon IO and re-encode to a small PNG; a missing package logo falls back to the UI's generic player icon.
    private static async Task<string> ReadIcon(AppListEntry entry, CancellationToken token)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token);
        deadline.CancelAfter(TimeSpan.FromSeconds(2));
        try
        {
            using var source = await entry.DisplayInfo.GetLogo(new Windows.Foundation.Size(48, 48)).OpenReadAsync().AsTask(deadline.Token);
            if (source.Size is 0 or > 512 * 1024) return "";
            using var input = source.GetInputStreamAt(0).AsStreamForRead();
            var bytes = new byte[(int)source.Size];
            await input.ReadExactlyAsync(bytes, deadline.Token);
            using var memory = new MemoryStream(bytes);
            using var image = Image.FromStream(memory);
            using var bitmap = new Bitmap(image, new System.Drawing.Size(48, 48));
            using var output = new MemoryStream();
            bitmap.Save(output, ImageFormat.Png);
            return "data:image/png;base64," + Convert.ToBase64String(output.ToArray());
        }
        catch (OperationCanceledException) when (token.IsCancellationRequested) { throw; }
        catch (Exception) { return ""; }
    }
}
