using System.Collections.Concurrent;
using FoliaLyrics;

// test/transport-smoke/AudioMaintenanceChecks.cs — exercise slow-driver scheduling without audio devices.
internal static class AudioMaintenanceChecks
{
    // A stalled enable must not stall preference changes or shutdown, and shutdown must be the last device operation.
    public static async Task Run(Action<bool, string> check)
    {
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var release = new ManualResetEventSlim();
        var calls = new ConcurrentQueue<bool>();
        var errors = new ConcurrentQueue<Exception>();
        var active = 0; var overlapped = false;
        using var maintenance = new AudioCaptureMaintenance(enabled =>
        {
            if (Interlocked.Increment(ref active) != 1) overlapped = true;
            try
            {
                calls.Enqueue(enabled);
                if (enabled)
                {
                    entered.TrySetResult();
                    if (!release.Wait(TimeSpan.FromSeconds(5))) throw new TimeoutException("test driver gate");
                }
            }
            finally { Interlocked.Decrement(ref active); }
        }, errors.Enqueue);
        try
        {
            maintenance.Request(true);
            await entered.Task.WaitAsync(TimeSpan.FromSeconds(3));
            check(!maintenance.Completion.IsCompleted, "audio enable returns while the simulated driver is still blocked");
            maintenance.Request(false); maintenance.Request(true); maintenance.Request(false);
            maintenance.Dispose(); maintenance.Request(true);
            var completion = maintenance.Completion;
            check(!completion.IsCompleted && calls.SequenceEqual([true]), "audio changes and disposal never wait for a blocked driver");
            release.Set(); await completion.WaitAsync(TimeSpan.FromSeconds(3));
            check(calls.SequenceEqual([true, false]) && !overlapped && errors.IsEmpty,
                "audio maintenance coalesces preferences, runs serially, and stops last on disposal");
        }
        finally { release.Set(); }

        var attempts = 0;
        using var recovering = new AudioCaptureMaintenance(enabled =>
        {
            if (enabled && Interlocked.Increment(ref attempts) == 1) throw new IOException("simulated driver failure");
        }, errors.Enqueue);
        recovering.Request(true); await recovering.Completion.WaitAsync(TimeSpan.FromSeconds(3));
        recovering.Request(true); await recovering.Completion.WaitAsync(TimeSpan.FromSeconds(3));
        check(attempts == 2 && errors.Count == 1, "a failed audio maintenance call is observed and the next poll can retry");
        recovering.Dispose(); await recovering.Completion.WaitAsync(TimeSpan.FromSeconds(3));
    }
}
