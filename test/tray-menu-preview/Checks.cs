using FoliaLyrics;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text.Json;

// test/tray-menu-preview/Checks.cs — direct production key-handler and MSAA checks without simulated input or application preferences.
internal static class TrayMenuChecks
{
    private static readonly MethodInfo ProcessKey = typeof(TrayMenu).GetMethod("ProcessCmdKey", BindingFlags.Instance | BindingFlags.NonPublic)!;

    // Exercise the production methods in process; these checks do not establish external UIA discovery or desktop keyboard focus.
    internal static int Run()
    {
        var run = new CheckRun();
        try { CheckKeys(run); CheckActions(run); CheckAccessibility(run); }
        catch (Exception error) { run.Fail("unexpected exception: " + error); }
        var output = Environment.GetEnvironmentVariable("FOLIA_TRAY_CHECKS") ?? DefaultResults();
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(output))!);
        File.WriteAllText(output, JsonSerializer.Serialize(new
        {
            scope = "Direct production ProcessCmdKey and in-process MSAA; no external UIA or real keyboard-focus assertion.",
            passed = run.Passed, failed = run.Failures.Count, failures = run.Failures, checks = run.Labels
        }, new JsonSerializerOptions { WriteIndented = true }));
        Console.WriteLine($"{run.Passed} tray-menu preview checks passed; {run.Failures.Count} failed. Results: {output}");
        return run.Failures.Count == 0 ? 0 : 1;
    }

    private static void CheckKeys(CheckRun run)
    {
        var actions = new List<TrayMenuAction>();
        using var menu = new TrayMenu(actions.Add);
        run.Check(menu.SelectedIndex == -1, "a new menu has no selection");
        run.Check(Key(menu, Keys.Down) && menu.SelectedIndex == 0, "Down selects the first item from no selection");
        run.Check(Key(menu, Keys.Down) && menu.SelectedIndex == 1, "Down advances one item");
        run.Check(Key(menu, Keys.Home) && menu.SelectedIndex == 0, "Home selects the first item");
        run.Check(Key(menu, Keys.Up) && menu.SelectedIndex == 5, "Up wraps from first to last");
        run.Check(Key(menu, Keys.Down) && menu.SelectedIndex == 0, "Down wraps from last to first");
        run.Check(Key(menu, Keys.End) && menu.SelectedIndex == 5, "End selects the last item");
        run.Check(Key(menu, Keys.Up) && menu.SelectedIndex == 4, "Up moves backward one item");
        foreach (var key in new[] { Keys.Escape, Keys.Tab, Keys.Shift | Keys.Tab })
            run.Check(Key(menu, key) && actions.Count == 0, $"{key} is consumed without executing an action");
        using var unselected = new TrayMenu(actions.Add);
        run.Check(Key(unselected, Keys.Enter) && actions.Count == 0, "Enter without a selection is consumed without an action");
        run.Check(Key(unselected, Keys.Space) && actions.Count == 0, "Space without a selection is consumed without an action");
        run.Check(Key(unselected, Keys.Up) && unselected.SelectedIndex == 5, "Up selects the last item from no selection");
    }

    private static void CheckActions(CheckRun run)
    {
        foreach (var key in new[] { Keys.Enter, Keys.Space })
        {
            for (var index = 0; index < 6; index++)
            {
                var actions = new List<TrayMenuAction>();
                using var menu = new TrayMenu(actions.Add);
                Key(menu, Keys.Home);
                for (var step = 0; step < index; step++) Key(menu, Keys.Down);
                run.Check(Key(menu, key) && actions.SequenceEqual([(TrayMenuAction)index]), $"{key} executes command {index} exactly once");
            }
        }
    }

    private static void CheckAccessibility(CheckRun run)
    {
        var actions = new List<TrayMenuAction>();
        using var menu = new TrayMenu(actions.Add);
        var root = menu.AccessibilityObject;
        string[] names = ["显示歌词窗口", "恢复鼠标操作", "窗口置顶", "歌词设置", "音乐软件管理", "退出"];
        run.Check(root.Role == AccessibleRole.MenuPopup, "MSAA root has the popup-menu role");
        run.Check(root.GetChildCount() == names.Length, "MSAA root exposes all six items");
        run.Check(root.GetChild(-1) is null && root.GetChild(6) is null, "MSAA children reject indices outside the menu");
        run.Check(root.GetFocused() is null, "hidden unselected menu reports no focused child");
        for (var index = 0; index < names.Length; index++)
        {
            var item = root.GetChild(index)!;
            run.Check(item.Name == names[index], $"MSAA item {index} has the expected name");
            run.Check(item.Role == AccessibleRole.MenuItem && ReferenceEquals(item.Parent, root), $"MSAA item {index} has its menu role and parent");
            run.Check(item.DefaultAction == "执行", $"MSAA item {index} describes its default action");
            run.Check(item.KeyboardShortcut == (index == 1 ? "Ctrl+Alt+L" : null), $"MSAA item {index} exposes the correct shortcut");
            run.Check(ReferenceEquals(item.Navigate(AccessibleNavigation.Previous), root.GetChild(index - 1)), $"MSAA item {index} navigates to the previous item or the boundary");
            run.Check(ReferenceEquals(item.Navigate(AccessibleNavigation.Next), root.GetChild(index + 1)), $"MSAA item {index} navigates to the next item or the boundary");
            var expectedFlags = AccessibleStates.Focusable | AccessibleStates.Selectable | AccessibleStates.Invisible;
            run.Check((item.State & expectedFlags) == expectedFlags && (item.State & AccessibleStates.Focused) == 0, $"hidden MSAA item {index} is selectable and invisible without focus");
            item.Select(AccessibleSelection.TakeSelection);
            run.Check(menu.SelectedIndex == index && (item.State & AccessibleStates.Selected) != 0, $"MSAA selection selects item {index}");
            run.Check(root.GetFocused() is null && (item.State & AccessibleStates.Focused) == 0, $"hidden selected MSAA item {index} does not claim focus");
            actions.Clear(); item.DoDefaultAction();
            run.Check(actions.SequenceEqual([(TrayMenuAction)index]), $"MSAA item {index} invokes its mapped command exactly once");
        }
    }

    private static bool Key(TrayMenu menu, Keys key) => (bool)ProcessKey.Invoke(menu, [default(Message), key])!;
    private static string DefaultResults([CallerFilePath] string source = "") => Path.GetFullPath(Path.Combine(Path.GetDirectoryName(source)!, "..", "..", "test-results", "tray-menu", "preview-checks", "results.json"));

    private sealed class CheckRun
    {
        internal int Passed { get; private set; }
        internal List<string> Labels { get; } = [];
        internal List<string> Failures { get; } = [];
        internal void Check(bool condition, string label)
        {
            Labels.Add(label);
            if (condition) { Passed++; Console.WriteLine("PASS " + label); }
            else Fail(label);
        }
        internal void Fail(string label) { Failures.Add(label); Console.WriteLine("FAIL " + label); }
    }
}
