using System.Drawing.Imaging;
using FoliaLyrics;

// test/music-app-smoke/IconChecks.cs — real PNG alpha/layout checks for saved and newly extracted shortcut icons.
internal static class IconChecks
{
    private const string Prefix = "data:image/png;base64,";

    internal static void Run(Action<bool, string> check)
    {
        using var padded = Fixture(new Rectangle(15, 15, 19, 19));
        var saved = Png(padded);
        var normalized = MusicAppIcon.Normalize(saved);
        using var corrected = Decode(normalized);
        var bounds = Bounds(corrected);
        check(corrected.Size == new Size(96, 96) && bounds.Width >= 86 && bounds.Height >= 86,
            "a 19px Salt-style glyph in a 48px canvas fills the normal icon area after migration");
        check(Math.Abs(bounds.Left + bounds.Width / 2d - 48) <= 1 && Math.Abs(bounds.Top + bounds.Height / 2d - 48) <= 1,
            "cropped icon is centered in its new canvas");
        check(corrected.GetPixel(0, 0).A == 0 && corrected.GetPixel(48, 48).ToArgb() == Color.CornflowerBlue.ToArgb(),
            "normalization preserves transparent corners and opaque glyph color");
        check(ReferenceEquals(MusicAppIcon.Normalize(saved), normalized) && MusicAppIcon.Normalize(normalized) == normalized,
            "cached normalization is stable and normalized icons are not cropped repeatedly");
        using var extracted = Decode(MusicAppIcon.Encode(padded));
        check(Bounds(extracted).Width >= 86, "new executable and Store icons use the same padding correction");

        using var offCenter = Fixture(new Rectangle(3, 9, 19, 9));
        using var wide = Decode(MusicAppIcon.Normalize(Png(offCenter)));
        var wideBounds = Bounds(wide);
        check(wideBounds.Width >= 86 && Math.Abs((double)wideBounds.Width / wideBounds.Height - 19d / 9) < .12,
            "off-center wide artwork retains its aspect ratio instead of being stretched square");
        check(Math.Abs(wideBounds.Left + wideBounds.Width / 2d - 48) <= 1 && Math.Abs(wideBounds.Top + wideBounds.Height / 2d - 48) <= 1,
            "asymmetric source padding does not offset the corrected icon");

        using var full = Fixture(new Rectangle(0, 0, 48, 48));
        var normal = Png(full);
        check(MusicAppIcon.Normalize(normal) == normal, "ordinary full-size icons keep their exact saved PNG bytes");
        using var transparent = Fixture(Rectangle.Empty);
        var empty = Png(transparent);
        check(MusicAppIcon.Normalize(empty) == empty, "an entirely transparent icon is not treated as a crop rectangle");
        foreach (var malformed in new[] { "custom-icon", Prefix + "not-base64", Prefix + "AAECAw==", Prefix + new string('A', 128 * 1024) })
            check(MusicAppIcon.Normalize(malformed) == malformed, "unreadable or oversized icon leaves metadata normalization usable");
        check(MusicAppIcon.Normalize(null) == "" && MusicAppIcon.Normalize("") == "", "missing icons keep the existing UI fallback");
        using var oversized = new Bitmap(1025, 1);
        var large = Png(oversized);
        check(MusicAppIcon.Normalize(large) == large && MusicAppIcon.Encode(oversized) == "", "decoded dimensions are bounded before pixel scanning");
        using var thin = new Bitmap(1, 1024);
        using (var graphics = Graphics.FromImage(thin)) graphics.Clear(Color.CornflowerBlue);
        using var thinResult = Decode(MusicAppIcon.Encode(thin));
        check(Bounds(thinResult).Width >= 1 && Bounds(thinResult).Height >= 86, "extreme aspect ratios retain at least one pixel on the short edge");

        var binding = new MusicAppBinding(7, "Saved Salt", "", saved, "store", "Sakawish.SaltPlayerforWindows_q65q631pyh094!SaltPlayerforWindows");
        var migrated = MusicAppLauncher.NormalizeBindings([binding]).Single();
        check(migrated == binding with { Icon = normalized }, "old saved bindings gain the corrected icon without changing name, slot or Store identity");
        var fresh = binding with { Icon = normal, Name = "Changed package name" };
        var existing = new[] { migrated, binding with { Slot = 8, LaunchKind = "exe", Path = @"C:\Other.exe" } };
        var updated = MusicAppLauncher.ApplyRefreshedStoreIcons(existing, new Dictionary<int, MusicAppBinding> { [7] = fresh });
        check(updated[0] == migrated with { Icon = normal } && updated[1] == existing[1],
            "high-resolution Store art refreshes an existing shortcut without replacing its identity, name or neighbors");
        check(ReferenceEquals(MusicAppLauncher.ApplyRefreshedStoreIcons(updated, new Dictionary<int, MusicAppBinding> { [7] = fresh }), updated),
            "unchanged Store art does not trigger a second preferences write");
        check(ReferenceEquals(MusicAppLauncher.ApplyRefreshedStoreIcons(existing, new Dictionary<int, MusicAppBinding>
        {
            [7] = fresh with { AppUserModelId = "OtherPublisher_App!Player" },
            [8] = fresh with { Slot = 8 },
        }), existing), "stale or mismatched Store icon results cannot overwrite another saved binding");
    }

    internal static void NormalizeFixture(string input, string output)
    {
        var normalized = MusicAppIcon.Normalize(Prefix + Convert.ToBase64String(File.ReadAllBytes(input)));
        File.WriteAllBytes(output, Convert.FromBase64String(normalized[Prefix.Length..]));
        using var bitmap = Decode(normalized);
        var bounds = Bounds(bitmap);
        Console.WriteLine($"Normalized fixture: {bitmap.Width}x{bitmap.Height}, visible {bounds.Width}x{bounds.Height}");
    }

    private static Bitmap Fixture(Rectangle artwork)
    {
        var bitmap = new Bitmap(48, 48, PixelFormat.Format32bppArgb);
        using var graphics = Graphics.FromImage(bitmap);
        using var brush = new SolidBrush(Color.CornflowerBlue);
        if (!artwork.IsEmpty) graphics.FillRectangle(brush, artwork);
        return bitmap;
    }
    private static string Png(Bitmap bitmap)
    {
        using var stream = new MemoryStream();
        bitmap.Save(stream, ImageFormat.Png);
        return Prefix + Convert.ToBase64String(stream.ToArray());
    }
    private static Bitmap Decode(string icon)
    {
        using var stream = new MemoryStream(Convert.FromBase64String(icon[Prefix.Length..]));
        using var image = Image.FromStream(stream);
        return new Bitmap(image);
    }
    private static Rectangle Bounds(Bitmap bitmap)
    {
        var left = bitmap.Width; var top = bitmap.Height; var right = -1; var bottom = -1;
        for (var y = 0; y < bitmap.Height; y++)
            for (var x = 0; x < bitmap.Width; x++)
            {
                if (bitmap.GetPixel(x, y).A <= 8) continue;
                left = Math.Min(left, x); top = Math.Min(top, y); right = Math.Max(right, x); bottom = Math.Max(bottom, y);
            }
        return right < left ? Rectangle.Empty : Rectangle.FromLTRB(left, top, right + 1, bottom + 1);
    }
}
