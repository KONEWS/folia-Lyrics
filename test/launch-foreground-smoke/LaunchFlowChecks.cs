using FoliaLyrics;

// test/launch-foreground-smoke/LaunchFlowChecks.cs — drive the real asynchronous launch path with controlled harmless launch tasks.
internal static class LaunchFlowChecks
{
    // Tasks run where the real shell launch would run; gates make completion, cancellation and failure deterministic.
    internal static async Task Run(Action<bool, string> check)
    {
        using (var window = new MainWindow())
        {
            var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var finish = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var launches = 0;
            MusicAppLauncher.Launch = (_, _) =>
            {
                Interlocked.Increment(ref launches);
                check(window.TopMost && window.Activations > 0, "the real launch path raises lyrics before invoking the external launcher");
                started.SetResult(); return finish.Task;
            };
            var operation = window.Launch(0);
            await started.Task.WaitAsync(TimeSpan.FromSeconds(5));
            window.Elapse(2000); await window.Launch(0);
            check(launches == 1 && window.Remaining == 5000, "repeated real launch requests renew protection without launching a second process");
            window.Elapse(2000); finish.SetResult(); await operation;
            check(window.Remaining == 5000 && window.TopMost && window.Messages.Count == 1, "successful launch completion renews protection and sends its usual notice");
            check(!window.Pinned && window.Saves == 0, "the complete launch path never persists temporary topmost");
        }
        using (var window = new MainWindow())
        {
            MusicAppLauncher.Launch = (_, _) => Task.FromException(new IOException("isolated launcher failure"));
            await window.Launch(0);
            check(!window.TopMost && !window.TimerRunning && window.Messages.Count == 1, "a failed real launch clears protection and reports the error");
            MusicAppLauncher.Launch = (_, _) => Task.CompletedTask;
            await window.Launch(0);
            check(window.TopMost && window.Remaining == 5000 && window.Messages.Count == 2, "a failed launch can be retried immediately");
        }
        using (var window = new MainWindow())
        {
            var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var finish = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            MusicAppLauncher.Launch = (_, _) => { started.SetResult(); return finish.Task; };
            var operation = window.Launch(0); await started.Task.WaitAsync(TimeSpan.FromSeconds(5));
            window.Pin(false); var activations = window.Activations; finish.SetResult(); await operation;
            check(!window.TopMost && window.Activations == activations && window.Saves == 1,
                "the real asynchronous completion respects a pin change made while launching");
        }
        using (var window = new MainWindow())
        {
            var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            MusicAppLauncher.Launch = (_, token) => { started.SetResult(); return Task.Delay(Timeout.Infinite, token); };
            var operation = window.Launch(0); await started.Task.WaitAsync(TimeSpan.FromSeconds(5));
            window.Dispose(); await operation;
            check(window.TimerDisposed && window.Remaining == 0 && window.Messages.Count == 0,
                "closing during the real launch path cancels it without late foreground work or notices");
        }
        using (var window = new MainWindow())
        {
            var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var finish = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            MusicAppLauncher.Launch = (_, _) => { started.SetResult(); return finish.Task; };
            var operation = window.Launch(0); await started.Task.WaitAsync(TimeSpan.FromSeconds(5));
            window.Dispose(); finish.SetException(new IOException("late failure")); await operation;
            check(window.Remaining == 0 && window.Messages.Count == 0, "an uncooperative launcher failing after disposal does not send a late notice");
        }
        MusicAppLauncher.Launch = (_, _) => Task.CompletedTask;
    }
}
