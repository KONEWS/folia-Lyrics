using FoliaLyrics;
using System.Windows.Forms;

// test/launch-foreground-smoke/Program.cs — deterministic checks for temporary foreground state and saved pin behavior.
var count = 0;
void Check(bool condition, string message)
{
    if (!condition) throw new Exception(message);
    count++; Console.WriteLine("PASS " + message);
}

using (var window = new MainWindow())
{
    Check(!window.TopMost && !window.TimerRunning, "ordinary startup preserves the unpinned preference");
    var request = window.Begin();
    Check(window.TopMost && window.Remaining == 5000 && window.TimerRunning, "a launch gets five seconds of temporary topmost protection");
    Check(window.Fronts == 1 && window.Activations == 1 && window.Focuses == 1, "a launch raises and activates the lyrics window immediately");
    Check(!window.Pinned && window.Saves == 0, "temporary protection never saves the user's pin preference");
    window.Elapse(2000); window.Renew(request);
    Check(window.TopMost && window.Remaining == 5000, "a completed or repeated launch renews the full five seconds");
    window.Elapse(4999);
    Check(window.TopMost && window.TimerRunning, "protection remains active until its complete duration passes");
    window.Elapse(1);
    Check(!window.TopMost && !window.TimerRunning && window.Saves == 0, "expiry restores the preference and stops the timer without writing it");
}
using (var window = new MainWindow(true))
{
    window.Begin(); window.Elapse(5000);
    Check(window.TopMost && window.Pinned && window.Saves == 0, "an already pinned window stays pinned after expiry");
    var request = window.Begin(); window.Cancel(request);
    Check(window.TopMost && !window.TimerRunning, "a failed launch never disables permanent topmost");
}
using (var window = new MainWindow())
{
    var first = window.Begin(); window.Elapse(1000); var second = window.Begin();
    window.Cancel(second);
    Check(window.TopMost && window.Remaining == 4000, "one failed launch preserves another valid launch's remaining hold");
    window.Cancel(first);
    Check(!window.TopMost && !window.TimerRunning && window.Saves == 0, "failure immediately removes the last temporary hold");
    window.Renew(first);
    Check(!window.TopMost && !window.TimerRunning, "a cancelled request cannot regain topmost");
}
using (var window = new MainWindow())
{
    var request = window.Begin(); window.Elapse(5000); window.Renew(request);
    Check(window.TopMost && window.Remaining == 5000, "a slow successful launch can renew a hold that already expired");
    window.Pin(false);
    Check(!window.TopMost && !window.Pinned && !window.TimerRunning && window.Saves == 1, "explicitly turning topmost off applies immediately during a launch");
    window.Renew(request);
    Check(!window.TopMost && !window.TimerRunning, "late launch completion cannot override an explicit pin change");
    request = window.Begin(); window.Pin(true); window.Elapse(6000); window.Cancel(request);
    Check(window.TopMost && window.Pinned && window.Saves == 2, "explicitly enabling topmost survives expiry and late launch failure");
}
using (var window = new MainWindow())
{
    window.WindowState = FormWindowState.Maximized;
    var request = window.Begin(); window.Renew(request);
    Check(window.WindowState == FormWindowState.Maximized, "raising the lyrics preserves a maximized window");
    window.WindowState = FormWindowState.Minimized;
    var activations = window.Activations; window.Renew(request);
    Check(window.WindowState == FormWindowState.Minimized && window.Activations == activations, "slow completion respects a user minimize after launching");
    window.Visible = false; window.Begin();
    Check(window.Visible && window.WindowState == FormWindowState.Normal, "an explicit new launch restores a hidden or minimized lyrics window");
    window.Dispose();
    Check(window.TimerDisposed && !window.TimerRunning && window.Remaining == 0, "disposing the window clears holds and disposes the timer");
    window.Renew(request); window.Cancel(request);
    Check(window.Remaining == 0 && !window.TimerRunning, "late launch continuations remain harmless after window disposal");
}
await LaunchFlowChecks.Run(Check);
await LaunchFollowChecks.Run(Check);
Console.WriteLine($"{count} launch-foreground checks passed");
