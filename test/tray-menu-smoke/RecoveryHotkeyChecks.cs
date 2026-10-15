using FoliaLyrics;
using System.ComponentModel;

// test/tray-menu-smoke/RecoveryHotkeyChecks.cs — inject registration outcomes without reserving a real key or opening a window.
internal static class RecoveryHotkeyChecks
{
    internal static void Run(Action<bool, string> check)
    {
        var logs = new List<Exception>();
        var success = new RecoveryHotkeyPolicy(); var registrations = 0; var releases = 0;
        check(!success.Registered && !success.TrayText.Contains(RecoveryHotkeyPolicy.Shortcut)
            && success.TrayText.Contains("双击托盘"), "before registration the tray only offers its reliable recovery action");
        success.Register(() => { registrations++; return true; }, () => throw new Exception("unexpected error read"), logs.Add);
        check(success.Registered && registrations == 1 && logs.Count == 0, "successful registration exposes the shortcut without reading a stale native error");
        check(success.TrayText.Contains(RecoveryHotkeyPolicy.Shortcut) && success.ClickThroughNotice.Contains("按 " + RecoveryHotkeyPolicy.Shortcut),
            "successful recovery registration updates both tray and click-through guidance");
        check(success.TakeFailureNotice(false) is null && success.TakeFailureNotice(true) is null, "successful registration never queues a failure notice");
        success.Register(() => { registrations++; return false; }, () => 1409, logs.Add);
        check(success.Registered && registrations == 1, "repeated registration of the same live handle is ignored");
        success.Release(() => releases++); success.Release(() => releases++);
        check(!success.Registered && releases == 1, "only a successfully registered key is released and only once");

        logs.Clear(); var conflict = new RecoveryHotkeyPolicy(); var errorReads = 0;
        conflict.Register(() => false, () => { errorReads++; return 1409; }, logs.Add);
        check(!conflict.Registered && errorReads == 1, "a failed registration captures its native error immediately");
        check(logs.Count == 1 && logs[0] is Win32Exception { NativeErrorCode: 1409 }
            && logs[0].Message.Contains("1409") && logs[0].Message.Contains(RecoveryHotkeyPolicy.Shortcut),
            "a registration conflict logs the shortcut and useful Win32 error");
        check(!conflict.TrayText.Contains(RecoveryHotkeyPolicy.Shortcut) && conflict.TrayText.Contains("双击托盘"),
            "a failed registration removes the unavailable shortcut from the tray tooltip");
        check(conflict.ClickThroughNotice.Contains("不可用") && conflict.ClickThroughNotice.Contains("双击托盘")
            && conflict.ClickThroughNotice.Contains("恢复鼠标操作") && !conflict.ClickThroughNotice.Contains("按 " + RecoveryHotkeyPolicy.Shortcut),
            "click-through failure guidance always describes usable tray recovery");
        check(conflict.TakeFailureNotice(false) is null && conflict.TakeFailureNotice(false) is null,
            "failure before ready remains queued across repeated premature checks");
        var notice = conflict.TakeFailureNotice(true);
        check(notice is not null && notice.Contains("被其他程序占用") && notice.Contains("双击托盘") && notice.Contains("恢复鼠标操作"),
            "the first ready delivers the conflict warning with both tray recovery methods");
        check(conflict.TakeFailureNotice(true) is null, "repeated ready does not replay the warning");
        conflict.Register(() => false, () => 1409, logs.Add);
        check(logs.Count == 1 && conflict.TakeFailureNotice(true) is null,
            "failed handle re-registration does not repeat its log or popup");
        conflict.Release(() => releases++);
        check(releases == 1, "failed registration never unregisters another program's shortcut");

        logs.Clear(); var deferred = new RecoveryHotkeyPolicy();
        deferred.Register(() => false, () => 5, logs.Add);
        deferred.Register(() => false, () => 5, logs.Add);
        check(logs.Count == 1, "repeated failures before ready are logged once");
        deferred.Register(() => true, () => throw new Exception("unexpected error read"), logs.Add);
        check(deferred.Registered && deferred.TakeFailureNotice(true) is null,
            "successful handle recreation before ready cancels an obsolete failure notice");
        deferred.Release(() => { }); deferred.Register(() => false, () => 5, logs.Add);
        notice = deferred.TakeFailureNotice(true);
        check(notice is not null && notice.Contains("未能启用") && !notice.Contains("被其他程序占用"),
            "other native errors do not falsely claim another application owns the key");
        check(logs.Count == 2, "a failure after a successful registration is logged again");
        deferred.Release(() => throw new Exception("unregistered key released"));
        deferred.Register(() => true, () => 0, logs.Add); deferred.Release(() => { });
        deferred.Register(() => false, () => 1409, logs.Add);
        check(deferred.TakeFailureNotice(true) is null && logs.Count == 3,
            "later availability changes retain useful logs without repeatedly interrupting the user");
    }
}
