using System.Text.Json;

// native/SystemVolumePolicy.cs
namespace FoliaLyrics;
internal static class SystemVolumePolicy
{
    public const int PercentPerStep = 2;
    public const int MaximumSteps = 20;

    public static bool IsValidDelta(int delta) => delta is >= -MaximumSteps and <= MaximumSteps && delta != 0;

    public static bool TryReadDelta(JsonElement value, out int delta)
    {
        delta = 0;
        return value.ValueKind == JsonValueKind.Object
            && value.TryGetProperty("delta", out var number)
            && number.ValueKind == JsonValueKind.Number
            && number.TryGetInt32(out delta)
            && IsValidDelta(delta);
    }

    // 保留系统当前音量的小数精度，并限制滚轮增量和最终音量范围。
    public static float AdjustScalar(float current, int delta)
    {
        if (!IsValidDelta(delta)) throw new ArgumentOutOfRangeException(nameof(delta));
        if (!float.IsFinite(current)) throw new ArgumentOutOfRangeException(nameof(current));
        return Math.Clamp(Math.Clamp(current, 0f, 1f) + delta * (PercentPerStep / 100f), 0f, 1f);
    }

    public static int ToPercent(float scalar)
    {
        if (!float.IsFinite(scalar)) throw new ArgumentOutOfRangeException(nameof(scalar));
        return (int)Math.Round(Math.Clamp(scalar, 0f, 1f) * 100, MidpointRounding.AwayFromZero);
    }
}
