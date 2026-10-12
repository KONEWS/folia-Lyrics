using System.Drawing.Imaging;
using System.Runtime.InteropServices;

// native/AcrylicCanvas.cs — a premultiplied-alpha DIB keeps painted text opaque over the native DWM backdrop.
namespace FoliaLyrics;
internal sealed class AcrylicCanvas : IDisposable
{
    private readonly IntPtr dc, bitmap, previous;
    private readonly Bitmap surface;
    internal AcrylicCanvas(Size size)
    {
        dc = CreateCompatibleDC(IntPtr.Zero);
        var info = new BitmapInfo { Size = 40, Width = size.Width, Height = -size.Height, Planes = 1, BitCount = 32 };
        bitmap = CreateDIBSection(dc, ref info, 0, out var bits, IntPtr.Zero, 0);
        if (dc == IntPtr.Zero || bitmap == IntPtr.Zero || bits == IntPtr.Zero)
        {
            if (bitmap != IntPtr.Zero) DeleteObject(bitmap);
            if (dc != IntPtr.Zero) DeleteDC(dc);
            throw new InvalidOperationException("无法创建托盘菜单画面。");
        }
        previous = SelectObject(dc, bitmap);
        surface = new Bitmap(size.Width, size.Height, size.Width * 4, PixelFormat.Format32bppPArgb, bits);
    }
    internal void Paint(Graphics target, Action<Graphics> draw)
    {
        using (var graphics = Graphics.FromImage(surface)) draw(graphics);
        var output = target.GetHdc();
        try { BitBlt(output, 0, 0, surface.Width, surface.Height, dc, 0, 0, 0x00CC0020); }
        finally { target.ReleaseHdc(output); }
    }
    public void Dispose()
    {
        surface.Dispose(); SelectObject(dc, previous); DeleteObject(bitmap); DeleteDC(dc);
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct BitmapInfo
    {
        public uint Size; public int Width, Height; public ushort Planes, BitCount;
        public uint Compression, ImageSize; public int XPelsPerMeter, YPelsPerMeter; public uint ColorsUsed, ColorsImportant;
    }
    [DllImport("gdi32.dll")] private static extern IntPtr CreateCompatibleDC(IntPtr dc);
    [DllImport("gdi32.dll")] private static extern IntPtr CreateDIBSection(IntPtr dc, ref BitmapInfo info, uint usage, out IntPtr bits, IntPtr section, uint offset);
    [DllImport("gdi32.dll")] private static extern IntPtr SelectObject(IntPtr dc, IntPtr value);
    [DllImport("gdi32.dll")] private static extern bool DeleteObject(IntPtr value);
    [DllImport("gdi32.dll")] private static extern bool DeleteDC(IntPtr dc);
    [DllImport("gdi32.dll")] private static extern bool BitBlt(IntPtr target, int x, int y, int width, int height, IntPtr source, int sourceX, int sourceY, uint operation);
}
