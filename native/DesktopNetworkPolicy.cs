// native/DesktopNetworkPolicy.cs — the WebView reads packaged assets and host-granted video only; lyric HTTP stays in OnlineHttp.
namespace FoliaLyrics;
internal static class DesktopNetworkPolicy
{
    public static bool AllowsWebResource(string address)
    {
        if (!Uri.TryCreate(address, UriKind.Absolute, out var uri)) return false;
        if (uri.Scheme is "data" or "blob") return true;
        if (uri.Scheme != Uri.UriSchemeHttps || !uri.IsDefaultPort || uri.UserInfo.Length != 0) return false;
        return uri.Host == "folia.local"
            || uri.Host == "folia-video.local" && uri.AbsolutePath.StartsWith("/__video/", StringComparison.Ordinal);
    }
}
