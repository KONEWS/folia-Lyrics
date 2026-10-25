using System.Drawing.Text;
using System.Text.Json;

// The native host supplies installed family names to the shared font picker without browser font-access permissions.
namespace FoliaLyrics;
internal sealed partial class MainWindow
{
    private Task<string[]>? installedSystemFonts;

    private async Task HandleSystemFontsCommand(JsonElement cmd)
    {
        if (!cmd.TryGetProperty("value", out var value) || value.ValueKind != JsonValueKind.Object) return;
        var requestId = value.Text("requestId");
        if (requestId.Length is 0 or > 80) return;
        try
        {
            installedSystemFonts ??= Task.Run(ReadInstalledSystemFonts, lifetime.Token);
            var families = await installedSystemFonts;
            if (!IsDisposed) Send("systemFonts", new { requestId, families });
        }
        catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { }
        catch (Exception error)
        {
            installedSystemFonts = null;
            DataFiles.Log(error);
            if (!IsDisposed) Send("systemFonts", new { requestId, families = Array.Empty<string>(), error = "unavailable" });
        }
    }

    // Dispose the GDI family objects as well as their collection after copying only the names for the web view.
    private static string[] ReadInstalledSystemFonts()
    {
        using var collection = new InstalledFontCollection();
        var families = collection.Families;
        try
        {
            return families.Select(family => family.Name.Trim()).Where(name => name.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(name => name, StringComparer.CurrentCultureIgnoreCase).ToArray();
        }
        finally
        {
            foreach (var family in families) family.Dispose();
        }
    }
}
