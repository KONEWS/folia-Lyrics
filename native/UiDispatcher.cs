// native/UiDispatcher.cs
namespace FoliaLyrics;
// Marshal before evaluating any UI/WebView readiness property, including during shutdown.
internal sealed class UiDispatcher(int ownerThread, Action<Action> post, Func<bool> alive)
{
    public void Run(Action action)
    {
        if (Environment.CurrentManagedThreadId != ownerThread)
        {
            try { post(() => Run(action)); }
            catch (InvalidOperationException) { }
            return;
        }
        if (alive()) action();
    }
}
