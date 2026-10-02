// native/AudioSpectrumWindow.cs — preserve the original 2048-sample Blackman window without per-packet trigonometry.
namespace FoliaLyrics;
internal static class AudioSpectrumWindow
{
    private static readonly double[] coefficients = Create();
    public static ReadOnlySpan<double> Coefficients => coefficients;
    private static double[] Create()
    {
        var values = new double[2048];
        for (var i = 0; i < values.Length; i++)
            values[i] = .42 - .5 * Math.Cos(2 * Math.PI * i / 2048) + .08 * Math.Cos(4 * Math.PI * i / 2048);
        return values;
    }
}
