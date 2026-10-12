using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

// native/MusicAppRunningProcesses.cs — bounded known-player process inspection and stable restart fingerprints.
namespace FoliaLyrics;
internal sealed record RunningMusicApp(string Path, string AppUserModelId, string Instance);
internal static class MusicAppRunningProcesses
{
    internal static RunningMusicApp[] Read(CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        var result = new List<RunningMusicApp>();
        var names = new HashSet<string>(MusicAppCatalog.ExecutableNames.Select(Path.GetFileNameWithoutExtension)!, StringComparer.OrdinalIgnoreCase);
        foreach (var process in Process.GetProcesses())
        {
            using (process)
            {
                token.ThrowIfCancellationRequested();
                try
                {
                    if (!names.Contains(process.ProcessName)) continue;
                    var appId = ApplicationId(process.Id);
                    var instance = process.Id + ":" + process.StartTime.ToUniversalTime().Ticks;
                    if (MusicAppDiscoveryPolicy.ValidAppUserModelId(appId)) result.Add(new("", appId, instance));
                    else if (process.MainModule?.FileName is string path) result.Add(new(path, "", instance));
                }
                catch (Exception error) when (error is System.ComponentModel.Win32Exception or InvalidOperationException or NotSupportedException) { }
            }
        }
        return result.ToArray();
    }

    // Query the OS identity with minimal process access; packaged desktop apps may run a different exe than their manifest stub.
    private static string ApplicationId(int processId)
    {
        using var process = OpenProcess(0x1000, false, processId);
        if (process.IsInvalid) return "";
        uint length = 0;
        if (GetApplicationUserModelId(process, ref length, null) != 122 || length is 0 or > 256) return "";
        var value = new StringBuilder((int)length);
        return GetApplicationUserModelId(process, ref length, value) == 0 ? value.ToString() : "";
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern SafeProcessHandle OpenProcess(uint access, [MarshalAs(UnmanagedType.Bool)] bool inherit, int processId);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetApplicationUserModelId(SafeProcessHandle process, ref uint length, StringBuilder? value);
}
