using System.Text.Json;

// native/DesktopNoticeTargets.cs — keep error destinations tied to commands rather than translated message text.
namespace FoliaLyrics;
internal static class DesktopNoticeTargets
{
    internal static object? ForCommand(JsonElement command)
    {
        if (command.ValueKind != JsonValueKind.Object) return null;
        var type = command.TryGetProperty("type", out var property) && property.ValueKind == JsonValueKind.String ? property.GetString() : null;
        if (type is "bindMusicApp" or "removeMusicApp" or "launchMusicApp")
        {
            if (command.TryGetProperty("value", out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var slot) && slot is >= 0 and < int.MaxValue)
                return new { id = "music-app-binding", slot };
            return new { id = "music-apps" };
        }
        var id = type switch
        {
            "import" => "local-import",
            "addFolder" or "rescan" => "local-folders",
            "source" or "mediaControl" => "player-source",
            "searchOnline" => "online-search",
            "selectOnline" or "resetOnline" or "cancelOnline" => "online-results",
            "copyDiagnostics" or "openLogFolder" => "diagnostics",
            "onlineEnabled" or "onlineProvider" => "online-sources",
            "addMusicApp" => "music-app-add",
            "scanMusicApps" or "autoDiscoverMusicApps" or "confirmMusicApps" or "blockMusicApp" or "unblockMusicApp" => "music-apps",
            "systemVolume" or "audioReactive" => "audio",
            _ => null,
        };
        return id is null ? null : new { id };
    }
}
