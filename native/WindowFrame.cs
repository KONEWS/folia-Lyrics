using System.Runtime.InteropServices;
using System.Text.Json;

// native/WindowFrame.cs
namespace FoliaLyrics;
internal sealed partial class MainWindow
{
    private long captionPressed; private Point captionPoint;
    private const long FrameStyles = 0x40000 | 0x80000 | 0x20000 | 0x10000;
    protected override CreateParams CreateParams
    {
        get { var parameters = base.CreateParams; if (!fullscreen) parameters.Style |= (int)FrameStyles; return parameters; }
    }
    private void WindowCommand(JsonElement value)
    {
        var action = value.Text("action");
        switch (action)
        {
            case "minimize": WindowState = FormWindowState.Minimized; break;
            case "maximize": if (!fullscreen) WindowState = WindowState == FormWindowState.Maximized ? FormWindowState.Normal : FormWindowState.Maximized; break;
            case "close": Close(); break;
            case "drag":
                if (fullscreen) break;
                var position = Cursor.Position; var now = Environment.TickCount64;
                if (now - captionPressed < SystemInformation.DoubleClickTime && Math.Abs(position.X - captionPoint.X) <= SystemInformation.DoubleClickSize.Width / 2 && Math.Abs(position.Y - captionPoint.Y) <= SystemInformation.DoubleClickSize.Height / 2)
                { captionPressed = 0; WindowState = WindowState == FormWindowState.Maximized ? FormWindowState.Normal : FormWindowState.Maximized; }
                else { captionPressed = now; captionPoint = position; BeginWindowGesture(2); }
                break;
            case "resize":
                if (!fullscreen && WindowState == FormWindowState.Normal && value.TryGetProperty("edge", out var edge) && edge.TryGetInt32(out var hit) && hit is >= 10 and <= 17) BeginWindowGesture(hit);
                break;
        }
    }
    // WebView is a child HWND: explicit native gestures keep system moving, resizing and snapping.
    private void BeginWindowGesture(int hit)
    {
        if ((Control.MouseButtons & MouseButtons.Left) == 0) return;
        var cursor = Cursor.Position;
        ReleaseCapture(); SendMessage(Handle, 0xA1, new IntPtr(hit), new IntPtr((cursor.X & 0xffff) | (cursor.Y << 16)));
    }
    private void UpdateFrameStyles()
    {
        var style = GetWindowLongPtr(Handle, -16).ToInt64();
        SetWindowLongPtr(Handle, -16, new IntPtr(fullscreen ? style & ~FrameStyles : style | FrameStyles));
        SetWindowPos(Handle, IntPtr.Zero, 0, 0, 0, 0, 0x1 | 0x2 | 0x4 | 0x20);
    }
    private bool HandleCustomFrame(ref Message message)
    {
        if (message.Msg == 0x83 && message.WParam != IntPtr.Zero)
        {
            if (!fullscreen && (GetWindowLongPtr(Handle, -16).ToInt64() & 0x1000000) != 0)
            {
                var area = Screen.FromHandle(Handle).WorkingArea;
                Marshal.StructureToPtr(new NativeRect { Left = area.Left, Top = area.Top, Right = area.Right, Bottom = area.Bottom }, message.LParam, false);
            }
            message.Result = IntPtr.Zero; return true;
        }
        if (message.Msg == 0x24 && !fullscreen)
        {
            var screen = Screen.FromHandle(Handle); var area = screen.WorkingArea;
            var limits = Marshal.PtrToStructure<MinMaxInfo>(message.LParam);
            limits.MaxPosition = new(area.Left - screen.Bounds.Left, area.Top - screen.Bounds.Top);
            limits.MaxSize = new(area.Width, area.Height);
            limits.MinTrackSize = new(MinimumSize.Width, MinimumSize.Height);
            Marshal.StructureToPtr(limits, message.LParam, false); message.Result = IntPtr.Zero; return true;
        }
        return false;
    }
    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        if (dispatcher is not null) SendWindowState();
    }
    private void SendWindowState() => Send("windowState", new { maximized = WindowState == FormWindowState.Maximized, fullscreen });
    [StructLayout(LayoutKind.Sequential)] private struct NativePoint(int x, int y) { public int X = x, Y = y; }
    [StructLayout(LayoutKind.Sequential)] private struct NativeRect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] private struct MinMaxInfo { public NativePoint Reserved, MaxSize, MaxPosition, MinTrackSize, MaxTrackSize; }
    [DllImport("user32.dll")] private static extern bool ReleaseCapture();
    [DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr hwnd, uint msg, IntPtr wparam, IntPtr lparam);
    [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int width, int height, uint flags);
}
