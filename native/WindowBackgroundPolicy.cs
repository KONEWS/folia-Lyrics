// native/WindowBackgroundPolicy.cs — decisions for a window nobody can see, free of WinForms and WebView2 types so they can be unit-tested.
namespace FoliaLyrics;
internal static class WindowBackgroundPolicy
{
    // WM_SIZE wParam: SIZE_RESTORED = 0, SIZE_MINIMIZED = 1, SIZE_MAXIMIZED = 2. SIZE_MAXSHOW (3) and SIZE_MAXHIDE (4) are sent to
    // pop-up windows when another window changes, so they say nothing about this one (null = leave the current state alone).
    public static bool? MinimizedFrom(long sizeType) => sizeType switch { 1 => true, 0 or 2 => false, _ => null };

    // Spectrum frames are only useful while the page exists, the user wants sound response and the window can be seen.
    public static bool SpectrumTimerWanted(bool pageReady, bool audioReactive, bool minimized) => pageReady && audioReactive && !minimized;
}
