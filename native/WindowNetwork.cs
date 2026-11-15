using Microsoft.Web.WebView2.Core;

// native/WindowNetwork.cs — keep browser requests local and disable the optional browser services unused by a lyric window.
namespace FoliaLyrics;
internal sealed partial class MainWindow
{
    private static CoreWebView2EnvironmentOptions CreateBrowserOptions() => new()
    {
        IsCustomCrashReportingEnabled = true,
        AllowSingleSignOnUsingOSPrimaryAccount = false,
        AdditionalBrowserArguments = "--disable-background-networking --no-pings",
    };

    private void InitializeNetwork(CoreWebView2 core)
    {
        core.Settings.IsReputationCheckingRequired = false;
        core.Settings.IsGeneralAutofillEnabled = false;
        core.Settings.IsPasswordAutosaveEnabled = false;
        core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All, CoreWebView2WebResourceRequestSourceKinds.All);
        core.WebResourceRequested += (_, args) =>
        {
            if (!DesktopNetworkPolicy.AllowsWebResource(args.Request.Uri))
                args.Response = core.Environment.CreateWebResourceResponse(null, 403, "External resource blocked", "Content-Length: 0");
        };
        core.DownloadStarting += (_, args) => args.Cancel = true;
    }
}
