using FoliaLyrics;

// test/launch-foreground-smoke/LaunchFollowChecks.cs — isolate launch completion ordering from OS processes and user preferences.
internal static class LaunchFollowChecks
{
    private static TaskCompletionSource Gate() => new(TaskCreationOptions.RunContinuationsAsynchronously);

    // Controlled launch gates exercise late completion without sleeps, real music apps or saved user state.
    internal static async Task Run(Action<bool, string> check)
    {
        using (var window = new MainWindow())
        {
            MusicAppLauncher.Launch = (_, _) => Task.CompletedTask;
            await window.SelectSource("previous-player");
            await window.Launch(0);
            check(window.Source == @"C:\Players\A.exe", "successful executable launch follows its saved full path without a separate menu choice");
            check(!window.Pinned && window.Saves == 0, "automatic launch following does not persist temporary topmost");
        }
        using (var window = new MainWindow())
        {
            const string appId = "Music.Player_12345!App";
            window.SetBindings(new MusicAppBinding(0, "store player", "", "", "store", appId));
            MusicAppLauncher.Launch = (_, _) => Task.CompletedTask;
            await window.SelectSource("previous-player"); await window.Launch(0);
            check(window.Source == appId, "successful store launch follows its AUMID rather than an empty executable path");
        }
        using (var window = new MainWindow())
        {
            var starts = 0;
            var entered = Gate(); var finish = Gate();
            MusicAppLauncher.Launch = (_, _) => { Interlocked.Increment(ref starts); entered.TrySetResult(); return finish.Task; };
            var operation = window.Launch(0); await entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
            check(window.Source == "" && window.SourceChanges.Count == 0, "pending shell launch retains the currently followed source");
            var intent = window.SourceIntent; await window.Launch(0);
            check(window.SourceIntent > intent && starts == 1, "duplicate pending click refreshes source intent while retaining one process launch");
            finish.SetResult(); await operation;
            check(window.Source == @"C:\Players\A.exe" && window.SourceChanges.Count == 1,
                "latest duplicate click commits its source once after the shared launch succeeds");
        }
        using (var window = new MainWindow())
        {
            var starts = 0;
            MusicAppLauncher.Launch = (_, _) => { Interlocked.Increment(ref starts); return Task.CompletedTask; };
            await window.Launch(0); await window.SelectSource("manually-selected-player");
            await window.Launch(0);
            check(starts == 1 && window.Source == @"C:\Players\A.exe",
                "clicking a recently successful launch follows it again inside the duplicate guard without reopening its process");
        }
        using (var window = new MainWindow())
        {
            await window.SelectSource("existing-source");
            MusicAppLauncher.Launch = (_, _) => Task.FromException(new IOException("isolated failure"));
            await window.Launch(0);
            check(window.Source == "existing-source" && window.SourceChanges.SequenceEqual(["existing-source"]),
                "failed launch leaves the selected source untouched");
            MusicAppLauncher.Launch = (_, _) => Task.CompletedTask; await window.Launch(0);
            check(window.Source == @"C:\Players\A.exe", "retrying after failure can follow the successfully launched player");
        }
        await CheckLaunchOrder(check, firstFinishesLast: true);
        await CheckLaunchOrder(check, firstFinishesLast: false);
        foreach (var source in new[] { "", "selected-player" })
        {
            using var window = new MainWindow();
            var entered = Gate(); var finish = Gate();
            MusicAppLauncher.Launch = (_, _) => { entered.SetResult(); return finish.Task; };
            var operation = window.Launch(0); await entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
            await window.SelectSource(source); finish.SetResult(); await operation;
            check(window.Source == source && !window.SourceChanges.Contains(@"C:\Players\A.exe"), source.Length == 0
                ? "reselecting the current automatic option blocks a late launch completion"
                : "manual source selection while launching blocks a late launch completion");
        }
        using (var window = new MainWindow())
        {
            await window.SelectSource("already-selected");
            var entered = Gate(); var finish = Gate();
            MusicAppLauncher.Launch = (_, _) => { entered.SetResult(); return finish.Task; };
            var operation = window.Launch(0); await entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
            await window.SelectSource("ALREADY-SELECTED"); finish.SetResult(); await operation;
            check(window.Source == "already-selected" && window.SourceChanges.Count == 1,
                "reselecting the current fixed source with different casing also defeats stale launch completion");
        }
        using (var window = new MainWindow())
        {
            var enteredA = Gate(); var enteredB = Gate(); var finishA = Gate(); var finishB = Gate();
            var starts = 0;
            MusicAppLauncher.Launch = (binding, _) =>
            {
                Interlocked.Increment(ref starts);
                if (binding.Slot == 0) { enteredA.SetResult(); return finishA.Task; }
                enteredB.SetResult(); return finishB.Task;
            };
            var first = window.Launch(0); await enteredA.Task.WaitAsync(TimeSpan.FromSeconds(5));
            var second = window.Launch(1); await enteredB.Task.WaitAsync(TimeSpan.FromSeconds(5));
            await window.Launch(0); finishB.SetResult(); await second;
            check(window.Source == "", "reclicking pending player A supersedes player B before B completes");
            finishA.SetResult(); await first;
            check(starts == 2 && window.Source == @"C:\Players\A.exe",
                "a newer duplicate A click wins over B while each player starts only once");
        }
        using (var window = new MainWindow())
        {
            var entered = Gate(); var finish = Gate();
            MusicAppLauncher.Launch = (_, _) => { entered.SetResult(); return finish.Task; };
            var operation = window.Launch(0); await entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
            window.SetBindings(window.Binding(1)); finish.SetResult(); await operation;
            check(window.Source == "" && window.SourceChanges.Count == 0, "removing a binding prevents its pending launch from selecting a source");
        }
        using (var window = new MainWindow())
        {
            var entered = Gate(); var finish = Gate();
            MusicAppLauncher.Launch = (_, _) => { entered.SetResult(); return finish.Task; };
            var operation = window.Launch(0); await entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
            window.SetBindings(new MusicAppBinding(0, "replacement", @"C:\Players\Replacement.exe"));
            finish.SetResult(); await operation;
            check(window.Source == "" && window.SourceChanges.Count == 0, "replacing the same slot prevents its old completion from selecting the removed player");
        }
        using (var window = new MainWindow())
        {
            var oldEntered = Gate(); var finishOld = Gate(); var starts = 0;
            MusicAppLauncher.Launch = (binding, _) =>
            {
                Interlocked.Increment(ref starts);
                if (binding.Path == @"C:\Players\A.exe") { oldEntered.SetResult(); return finishOld.Task; }
                return Task.CompletedTask;
            };
            var old = window.Launch(0); await oldEntered.Task.WaitAsync(TimeSpan.FromSeconds(5));
            window.SetBindings(new MusicAppBinding(0, "replacement", @"C:\Players\Replacement.exe")); await window.Launch(0);
            finishOld.SetResult(); await old;
            check(starts == 2 && window.Source == @"C:\Players\Replacement.exe",
                "a replacement binding can launch in the same slot and cannot be overwritten by the old pending launch");
        }
        using (var window = new MainWindow())
        {
            var entered = Gate(); var finish = Gate();
            MusicAppLauncher.Launch = (_, _) => { entered.SetResult(); return finish.Task; };
            var operation = window.Launch(0); await entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
            window.Dispose(); finish.SetResult(); await operation;
            check(window.SourceChanges.Count == 0 && window.Messages.Count == 0,
                "successful uncooperative launch completion after disposal cannot select a source or send a notice");
        }
        MusicAppLauncher.Launch = (_, _) => Task.CompletedTask;
    }

    // Verify source intent decides the winner independently of which native launch task returns first.
    private static async Task CheckLaunchOrder(Action<bool, string> check, bool firstFinishesLast)
    {
        using var window = new MainWindow();
        var enteredA = Gate(); var enteredB = Gate(); var finishA = Gate(); var finishB = Gate();
        MusicAppLauncher.Launch = (binding, _) =>
        {
            if (binding.Slot == 0) { enteredA.SetResult(); return finishA.Task; }
            enteredB.SetResult(); return finishB.Task;
        };
        var first = window.Launch(0); await enteredA.Task.WaitAsync(TimeSpan.FromSeconds(5));
        var second = window.Launch(1); await enteredB.Task.WaitAsync(TimeSpan.FromSeconds(5));
        if (firstFinishesLast) { finishB.SetResult(); await second; finishA.SetResult(); await first; }
        else
        {
            finishA.SetResult(); await first;
            check(window.Source == "", "older player A completion cannot win while newer player B is still pending");
            finishB.SetResult(); await second;
        }
        check(window.Source == @"C:\Players\B.exe" && window.SourceChanges.SequenceEqual([@"C:\Players\B.exe"]), firstFinishesLast
            ? "later launch B remains followed when older launch A finishes last"
            : "later launch B wins when older launch A finishes first");
    }
}
