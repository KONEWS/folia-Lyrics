using System.ComponentModel;

// native/RecoveryHotkeyPolicy.cs — track recovery availability and defer one failure notice until the page is ready.
namespace FoliaLyrics;
internal sealed class RecoveryHotkeyPolicy
{
    internal const string Shortcut = "Ctrl+Alt+L";
    private bool failurePending, failureReported;
    private int? lastLoggedError;
    internal bool Registered { get; private set; }
    internal string TrayText => Registered ? $"Folia 桌面歌词 · {Shortcut} 恢复操作" : "Folia 桌面歌词 · 双击托盘图标恢复操作";
    internal string ClickThroughNotice => Registered
        ? $"已启用鼠标穿透。按 {Shortcut} 或双击托盘图标恢复操作。"
        : $"已启用鼠标穿透。恢复快捷键 {Shortcut} 不可用，请双击托盘图标，或右键选择“恢复鼠标操作”。";
    private string FailureNotice => lastLoggedError == 1409
        ? $"恢复快捷键 {Shortcut} 已被其他程序占用。请双击托盘图标，或右键选择“恢复鼠标操作”。"
        : $"恢复快捷键 {Shortcut} 未能启用。请双击托盘图标，或右键选择“恢复鼠标操作”。";

    // Read the native error immediately after a failed registration; repeated handle creation must not repeat the warning.
    internal void Register(Func<bool> register, Func<int> lastError, Action<Exception> log)
    {
        if (Registered) return;
        Registered = register();
        var error = Registered ? 0 : lastError();
        if (Registered) { failurePending = false; lastLoggedError = null; return; }
        failurePending = !failureReported;
        if (lastLoggedError == error) return;
        lastLoggedError = error;
        log(new Win32Exception(error, $"恢复快捷键 {Shortcut} 注册失败，Win32 错误 {error}：{new Win32Exception(error).Message}"));
    }
    internal string? TakeFailureNotice(bool ready)
    {
        if (!ready || !failurePending) return null;
        failurePending = false; failureReported = true;
        return FailureNotice;
    }
    internal void Release(Action unregister)
    {
        if (!Registered) return;
        Registered = false; unregister();
    }
}
