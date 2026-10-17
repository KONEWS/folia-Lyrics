using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

// native/MusicAppIcon.cs — remove oversized transparent Store-logo margins without changing shortcut identities.
namespace FoliaLyrics;
internal static class MusicAppIcon
{
    private const string Prefix = "data:image/png;base64,";
    private const int Size = 96, Inset = 4, MaxEncodedLength = 128 * 1024, MaxDimension = 1024;
    private static readonly Dictionary<string, string> normalized = new(StringComparer.Ordinal);

    // Existing preferences also pass through here, so upgrading fixes padded icons without rebinding the app.
    internal static string Normalize(string? icon)
    {
        if (string.IsNullOrEmpty(icon) || !icon.StartsWith(Prefix, StringComparison.Ordinal) || icon.Length > MaxEncodedLength) return icon ?? "";
        lock (normalized) if (normalized.TryGetValue(icon, out var cached)) return cached;
        var result = icon;
        try
        {
            using var memory = new MemoryStream(Convert.FromBase64String(icon[Prefix.Length..]));
            using var image = Image.FromStream(memory);
            if (ValidSize(image))
            {
                using var bitmap = Copy(image);
                var bounds = VisibleBounds(bitmap);
                if (ExcessivePadding(bitmap, bounds)) result = Encode(bitmap, bounds);
            }
        }
        catch (Exception error) when (error is ArgumentException or FormatException or ExternalException or OutOfMemoryException) { }
        lock (normalized)
        {
            if (normalized.Count >= 64) normalized.Clear();
            normalized[icon] = result;
            normalized[result] = result;
        }
        return result;
    }

    internal static string Encode(Image image)
    {
        if (!ValidSize(image)) return "";
        using var bitmap = Copy(image);
        var bounds = VisibleBounds(bitmap);
        return Encode(bitmap, ExcessivePadding(bitmap, bounds) ? bounds : new Rectangle(0, 0, bitmap.Width, bitmap.Height));
    }

    private static bool ValidSize(Image image) => image.Width is > 0 and <= MaxDimension && image.Height is > 0 and <= MaxDimension;
    private static bool ExcessivePadding(Bitmap image, Rectangle bounds) => !bounds.IsEmpty
        && Math.Max(bounds.Width, bounds.Height) < Math.Max(image.Width, image.Height) * .8;

    private static Bitmap Copy(Image image)
    {
        var bitmap = new Bitmap(image.Width, image.Height, PixelFormat.Format32bppArgb);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.CompositingMode = CompositingMode.SourceCopy;
        graphics.DrawImage(image, new Rectangle(0, 0, bitmap.Width, bitmap.Height));
        return bitmap;
    }

    // Scan alpha in memory once per encoded icon; transparent and unusually wide logos keep their original shape.
    private static Rectangle VisibleBounds(Bitmap bitmap)
    {
        var data = bitmap.LockBits(new Rectangle(0, 0, bitmap.Width, bitmap.Height), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        try
        {
            var row = new byte[bitmap.Width * 4];
            var left = bitmap.Width; var top = bitmap.Height; var right = -1; var bottom = -1;
            for (var y = 0; y < bitmap.Height; y++)
            {
                Marshal.Copy(data.Scan0 + y * data.Stride, row, 0, row.Length);
                for (var x = 0; x < bitmap.Width; x++)
                {
                    if (row[x * 4 + 3] == 0) continue;
                    left = Math.Min(left, x); top = Math.Min(top, y); right = Math.Max(right, x); bottom = Math.Max(bottom, y);
                }
            }
            return right < left ? Rectangle.Empty : Rectangle.FromLTRB(left, top, right + 1, bottom + 1);
        }
        finally { bitmap.UnlockBits(data); }
    }

    private static string Encode(Bitmap image, Rectangle source)
    {
        using var bitmap = new Bitmap(Size, Size, PixelFormat.Format32bppArgb);
        using (var graphics = Graphics.FromImage(bitmap))
        {
            graphics.CompositingMode = CompositingMode.SourceCopy;
            graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
            graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
            var scale = (Size - Inset * 2d) / Math.Max(source.Width, source.Height);
            var width = Math.Max(1, (int)Math.Round(source.Width * scale)); var height = Math.Max(1, (int)Math.Round(source.Height * scale));
            using var attributes = new ImageAttributes();
            attributes.SetWrapMode(WrapMode.TileFlipXY);
            graphics.DrawImage(image, new Rectangle((Size - width) / 2, (Size - height) / 2, width, height),
                source.X, source.Y, source.Width, source.Height, GraphicsUnit.Pixel, attributes);
        }
        using var output = new MemoryStream();
        bitmap.Save(output, ImageFormat.Png);
        return Prefix + Convert.ToBase64String(output.ToArray());
    }
}
