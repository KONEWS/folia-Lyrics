// native/WindowPersistence.cs — publish live preferences even when persistence fails, and make that failure visible.
namespace FoliaLyrics;
internal sealed partial class MainWindow
{
    private bool SavePreferences()
    {
        var saved = DataFiles.TrySave("preferences.json", preferences);
        Send("preferences", preferences);
        if (!saved) Send("notice", new { text = "当前设置已生效，但未能保存，重启后可能恢复原设置。请检查磁盘空间或文件权限后重试。" });
        return saved;
    }
}
