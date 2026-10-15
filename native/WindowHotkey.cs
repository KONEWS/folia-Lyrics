using System.Runtime.InteropServices;

// native/WindowHotkey.cs — register the recovery key and keep native guidance aligned with its actual availability.
namespace FoliaLyrics;
internal sealed partial class MainWindow
{
    private readonly RecoveryHotkeyPolicy recoveryHotkey = new();
    private string ClickThroughRecoveryNotice => recoveryHotkey.ClickThroughNotice;
    private void RegisterRecoveryHotkey()
    {
        recoveryHotkey.Register(() => TryRegisterRecoveryHotkey(Handle, 1, 0x0001 | 0x0002 | 0x4000, (uint)Keys.L),
            Marshal.GetLastWin32Error, DataFiles.Log);
        tray.Text = recoveryHotkey.TrayText;
        SendPendingRecoveryHotkeyNotice();
    }
    private void SendPendingRecoveryHotkeyNotice()
    {
        if (recoveryHotkey.TakeFailureNotice(ready) is { } text) Send("notice", new { text });
    }
    private void ReleaseRecoveryHotkey() => recoveryHotkey.Release(() => ReleaseRegisteredRecoveryHotkey(Handle, 1));
    [DllImport("user32.dll", EntryPoint = "RegisterHotKey", SetLastError = true)]
    private static extern bool TryRegisterRecoveryHotkey(IntPtr window, int id, uint modifiers, uint key);
    [DllImport("user32.dll", EntryPoint = "UnregisterHotKey")]
    private static extern bool ReleaseRegisteredRecoveryHotkey(IntPtr window, int id);
}
