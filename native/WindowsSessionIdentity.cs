using System.Runtime.InteropServices;
using Windows.Media.Control;

// native/WindowsSessionIdentity.cs
namespace FoliaLyrics;
internal static class WindowsSessionIdentity
{
    // IUnknown is canonical COM identity; managed WinRT wrapper Equals is not an identity contract.
    public static nint Get(GlobalSystemMediaTransportControlsSession session)
    {
        var inspectable = WinRT.MarshalInspectable<GlobalSystemMediaTransportControlsSession>.FromManaged(session);
        nint unknown = 0;
        try
        {
            var iid = new Guid("00000000-0000-0000-C000-000000000046");
            Marshal.ThrowExceptionForHR(Marshal.QueryInterface(inspectable, in iid, out unknown));
            return unknown;
        }
        finally { if (unknown != 0) Marshal.Release(unknown); Marshal.Release(inspectable); GC.KeepAlive(session); }
    }
}
