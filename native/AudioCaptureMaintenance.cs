// native/AudioCaptureMaintenance.cs — coalesce device maintenance off the window thread and stop capture last.
namespace FoliaLyrics;
internal sealed class AudioCaptureMaintenance(Action<bool> apply, Action<Exception> log) : IDisposable
{
    private readonly object gate = new();
    private Task? worker;
    private bool requested, enabled, disposed;
    internal Task Completion { get { lock (gate) return worker ?? Task.CompletedTask; } }

    public void Request(bool value)
    {
        lock (gate)
        {
            if (disposed) return;
            enabled = value; requested = true;
            worker ??= Task.Run(Drain);
        }
    }

    // One worker owns the device; requests arriving during a slow COM call collapse to the latest preference.
    private void Drain()
    {
        while (true)
        {
            bool value;
            lock (gate)
            {
                if (!requested) { worker = null; return; }
                value = enabled; requested = false;
            }
            try { apply(value); }
            catch (Exception error) { log(error); }
        }
    }

    // Never wait for a sound driver from FormClosed; the same worker releases it after any in-flight call.
    public void Dispose()
    {
        lock (gate)
        {
            if (disposed) return;
            disposed = true; enabled = false; requested = true;
            worker ??= Task.Run(Drain);
        }
    }
}
