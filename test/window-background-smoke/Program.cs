using FoliaLyrics;
using System.Runtime.CompilerServices;
using System.Windows.Forms;

// test/window-background-smoke/Program.cs — transition checks for the real WindowBackgroundState.cs: which timer, visibility, memory and focus calls happen, in what order.
// Opens no window, WebView or audio device and writes nothing outside the console; plain net10.0, so it runs the same on Linux and Windows.
var count = 0;
void Check(bool condition, string label)
{
    if (!condition) throw new Exception("FAIL " + label);
    count++; Console.WriteLine("PASS " + label);
}
void Sequence(MainWindow window, string label, params string[] expected)
{
    var actual = window.Take();
    Check(actual.SequenceEqual(expected), $"{label} => [{string.Join(", ", expected)}]" + (actual.SequenceEqual(expected) ? "" : $" (got [{string.Join(", ", actual)}])"));
}
// A window whose page has loaded, sound response is on and nothing is minimized yet.
MainWindow Running()
{
    var window = new MainWindow();
    window.PageReady(); window.Take();
    return window;
}
const string Hide = "web.Visible=false", Trim = "memory=Low", Untrim = "memory=Normal", Show = "web.Visible=true", Focus = "focus", TimerOn = "timer=on", TimerOff = "timer=off";

// Minimize before the page or the WebView core exist.
{
    var window = new MainWindow(coreAvailable: false);
    window.SizeMessage(1);
    Sequence(window, "minimize before the WebView core exists changes nothing", []);
    Check(!window.WebWasHidden && window.Web.Visible && !window.Timer.Enabled, "a hide request without a core is not recorded and the control stays visible");
    window.AttachCore(); window.PageReady();
    Sequence(window, "the page becoming ready while still minimized hides it now", Hide, Trim);
    Check(window.WebWasHidden && !window.Timer.Enabled, "the spectrum timer stays off while minimized, even with sound response on");
    window.SizeMessage(0);
    Sequence(window, "restoring starts the timer, untrims, shows and refocuses in that order", TimerOn, Untrim, Show, Focus);
}
// The core exists but the page has not said ready yet.
{
    var window = new MainWindow();
    window.SizeMessage(1);
    Sequence(window, "minimize after the core exists but before ready hides without starting a timer", Hide, Trim);
    window.PageReady();
    Sequence(window, "ready while already hidden does not hide, trim or start anything again", []);
    window.PageReady(); window.PageReady();
    Sequence(window, "page reloads while hidden (ready again, twice) cause no visibility flicker", []);
    window.SoundResponse(false); window.SoundResponse(true);
    Sequence(window, "toggling sound response while hidden never starts the timer", []);
    window.SizeMessage(0);
    Sequence(window, "restore after ready while hidden shows the page and starts the timer", TimerOn, Untrim, Show, Focus);
}
// Sound response on and off around restore.
{
    var window = new MainWindow();
    window.PageReady();
    Sequence(window, "ready on a visible window with sound response on starts the timer", TimerOn);
    window.SizeMessage(1);
    Sequence(window, "minimize stops the timer, hides, then trims", TimerOff, Hide, Trim);
    window.SoundResponse(false);
    Sequence(window, "switching sound response off while minimized changes nothing", []);
    window.SizeMessage(0);
    Sequence(window, "restore with sound response off shows the page without starting the timer", Untrim, Show, Focus);
    Check(!window.Timer.Enabled && window.Web.Visible, "after that restore the timer is off and the page is visible");
    window.SoundResponse(true);
    Sequence(window, "switching sound response on while visible starts the timer", TimerOn);
    window.SoundResponse(false); window.SoundResponse(false);
    Sequence(window, "switching it off twice stops the timer once", TimerOff);
    window.SoundResponse(true); window.SizeMessage(1); window.SoundResponse(true); window.SizeMessage(0); window.Take();
    Check(window.Timer.Enabled && window.Web.Visible, "minimize and restore with sound response on ends with timer on and page visible");
}
// Repeated transitions and non-transitions.
{
    var window = Running();
    for (var i = 0; i < 5; i++) window.SizeMessage(1);
    Sequence(window, "five consecutive minimize messages act once", TimerOff, Hide, Trim);
    for (var i = 0; i < 5; i++) window.SizeMessage(0);
    Sequence(window, "five consecutive restore messages act once", TimerOn, Untrim, Show, Focus);
    foreach (var type in new long[] { 3, 4, 5, 99, -1, long.MaxValue }) window.SizeMessage(type);
    Sequence(window, "SIZE_MAXSHOW, SIZE_MAXHIDE and unknown size types are ignored while visible", []);
    window.SizeMessage(1); window.Take();
    foreach (var type in new long[] { 3, 4, 99, -1 }) window.SizeMessage(type);
    Sequence(window, "the same ignored size types do not restore a hidden window", []);
    window.SizeMessage(2);
    Sequence(window, "SIZE_MAXIMIZED restores a hidden window like SIZE_RESTORED", TimerOn, Untrim, Show, Focus);
    for (var cycle = 0; cycle < 100; cycle++) { window.SizeMessage(1); window.SizeMessage(0); }
    var events = window.Take();
    Check(events.Count == 700 && new[] { Hide, Show, Trim, Untrim, TimerOn, TimerOff, Focus }.All(name => events.Count(e => e == name) == 100), "100 minimize/restore cycles perform each call exactly 100 times (no redundant or missing calls)");
    Check(window.Web.Visible && window.Timer.Enabled && !window.WebWasHidden, "after 100 cycles the page is visible, the timer is on and no hide is pending");
    window.PageReady();
    Sequence(window, "a reload while visible re-applies state without any call", []);
}
// Disposal and shutdown.
{
    var window = Running();
    window.Shutdown();
    window.SizeMessage(1); window.SoundResponse(false); window.PageReady();
    Sequence(window, "after the lifetime is cancelled no transition touches the timer or the page", []);
    Check(window.Timer.Enabled && window.Web.Visible, "shutdown leaves both exactly as they were");
    var disposed = Running(); disposed.IsDisposed = true; disposed.SizeMessage(1);
    Sequence(disposed, "a disposed form ignores size messages", []);
    var disposing = Running(); disposing.Disposing = true; disposing.SizeMessage(1);
    Sequence(disposing, "a form that is closing ignores size messages", []);
    var hiddenThenClosed = Running(); hiddenThenClosed.SizeMessage(1); hiddenThenClosed.Take(); hiddenThenClosed.Shutdown(); hiddenThenClosed.SizeMessage(0);
    Sequence(hiddenThenClosed, "a window closed while minimized is not restored on the way out", []);
    var controlGone = Running(); controlGone.Web.IsDisposed = true;
    controlGone.SizeMessage(1);
    Sequence(controlGone, "with the WebView control already disposed minimizing still stops the timer but never touches the control", TimerOff);
    controlGone.SizeMessage(0);
    Sequence(controlGone, "and restoring only restarts the timer", TimerOn);
    Check(!controlGone.WebWasHidden, "no hide is recorded for a control that was already disposed");
}
// Failures from the WebView must never escape from the window procedure.
{
    var window = Running();
    window.Web.CoreWebView2.ThrowOnMemoryTarget = true; DataFiles.Logged.Clear();
    window.SizeMessage(1);
    Sequence(window, "a runtime without the memory target still minimizes (timer off, hidden)", TimerOff, Hide);
    Check(DataFiles.Logged.Count == 1, "the unsupported memory target is logged once");
    window.SizeMessage(0);
    Sequence(window, "and still restores (timer on, shown, focused)", TimerOn, Show, Focus);
    Check(DataFiles.Logged.Count == 2 && window.Web.Visible, "the second failure is logged and the page ends visible");
}
{
    var window = Running(); DataFiles.Logged.Clear();
    window.Web.ThrowOnVisible = true;
    window.SizeMessage(1);
    Sequence(window, "a controller that rejects hiding does not throw out of the message handler", TimerOff);
    Check(DataFiles.Logged.Count == 1 && window.WebWasHidden, "the failure is logged and the intent to be hidden is kept");
    window.Web.ThrowOnVisible = false;
    window.SizeMessage(0);
    Sequence(window, "the next restore still shows the page", TimerOn, Untrim, Show, Focus);
    Check(window.Web.Visible && !window.WebWasHidden, "the page is visible again after the earlier failure");
}
{
    var window = Running(); window.SizeMessage(1); window.Take(); DataFiles.Logged.Clear();
    window.Web.ThrowOnVisible = true;
    window.SizeMessage(0);
    Sequence(window, "a controller that rejects showing is logged and the page is not refocused", TimerOn, Untrim);
    Check(DataFiles.Logged.Count == 1 && window.WebWasHidden, "a failed restore stays marked hidden so it will be retried");
    window.Web.ThrowOnVisible = false;
    window.SizeMessage(2);
    Sequence(window, "the next size change retries and shows the page (the timer is already on)", Untrim, Show, Focus);
    Check(window.Web.Visible && !window.WebWasHidden, "after the retry the page is visible and nothing is pending");
}
// The WM_SIZE size-type mapping and the timer decision table.
Check(WindowBackgroundPolicy.MinimizedFrom(1) == true && WindowBackgroundPolicy.MinimizedFrom(0) == false && WindowBackgroundPolicy.MinimizedFrom(2) == false
    && WindowBackgroundPolicy.MinimizedFrom(3) is null && WindowBackgroundPolicy.MinimizedFrom(4) is null && WindowBackgroundPolicy.MinimizedFrom(-1) is null, "WM_SIZE minimize, restore and maximize map to minimized/not minimized; pop-up sizes and junk map to nothing");
var truth = true;
foreach (var ready in new[] { false, true }) foreach (var reactive in new[] { false, true }) foreach (var minimized in new[] { false, true })
    truth &= WindowBackgroundPolicy.SpectrumTimerWanted(ready, reactive, minimized) == (ready && reactive && !minimized);
Check(truth, "the spectrum timer runs only when the page is ready, sound response is on and the window is not minimized (all 8 combinations)");

// Seams the stand-ins cannot compile: the call sites in the unlinked files must keep using the tested methods.
// The compiler records where this file lives, which stays right when the build output is redirected (--artifacts-path, CI layouts);
// walking up from the output folder is only the fallback.
string ThisSourceFile([CallerFilePath] string path = "") => path;
string? Find(string relative)
{
    var candidates = new List<string>();
    var here = ThisSourceFile();
    if (here.Length > 0) candidates.Add(Path.GetFullPath(Path.Combine(Path.GetDirectoryName(here)!, "..", "..", relative)));
    for (var folder = new DirectoryInfo(AppContext.BaseDirectory); folder is not null; folder = folder.Parent) candidates.Add(Path.Combine(folder.FullName, relative));
    return candidates.FirstOrDefault(File.Exists);
}
var commands = Find("native/WindowCommands.cs");
Check(commands is not null, "native/WindowCommands.cs is reachable from the test output folder");
var commandText = File.ReadAllText(commands!);
string CaseBody(string name)
{
    var start = commandText.IndexOf($"case \"{name}\":", StringComparison.Ordinal);
    var next = commandText.IndexOf("\n            case \"", start + 1, StringComparison.Ordinal);
    return start < 0 ? "" : commandText[start..(next < 0 ? commandText.Length : next)];
}
Check(CaseBody("ready").Contains("ApplyBackgroundStateForCurrentWindow()"), "the page's ready command re-applies the background state through the tested method");
Check(CaseBody("audioReactive").Contains("ApplyBackgroundStateForCurrentWindow()"), "the sound-response command re-applies the background state through the tested method");
Check(commandText.Contains("message.Msg == 0x5") && commandText.Contains("OnSizeMessage(message.WParam.ToInt64())"), "WndProc forwards WM_SIZE (0x5) and its size type to OnSizeMessage");
var started = Directory.EnumerateFiles(Path.GetDirectoryName(commands!)!, "*.cs", SearchOption.AllDirectories)
    .Where(path => File.ReadAllText(path).Contains("audioTimer.Start()")).Select(Path.GetFileName).ToArray();
Check(started.Length == 0, "nothing in native/ starts the spectrum timer directly, so minimize suppression cannot be bypassed" + (started.Length == 0 ? "" : " (found in " + string.Join(", ", started) + ")"));
Console.WriteLine($"{count} window-background checks passed");
