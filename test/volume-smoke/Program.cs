using FoliaLyrics;
using System.Text.Json;

// test/volume-smoke/Program.cs
var checks = 0;
void Check(bool condition, string label)
{
    if (!condition) throw new Exception(label);
    checks++;
}
void Reject(string json)
{
    using var document = JsonDocument.Parse(json);
    Check(!SystemVolumePolicy.TryReadDelta(document.RootElement, out _), $"拒绝非法增量：{json}");
}
void Accept(string json, int expected)
{
    using var document = JsonDocument.Parse(json);
    Check(SystemVolumePolicy.TryReadDelta(document.RootElement, out var delta) && delta == expected, $"接受整数增量：{json}");
}
void Near(float actual, float expected, string label) => Check(Math.Abs(actual - expected) < .00001f, label);
void Throws(Action action, string label)
{
    try { action(); }
    catch (ArgumentOutOfRangeException) { checks++; return; }
    throw new Exception(label);
}

Accept("{\"delta\":1}", 1);
Accept("{\"delta\":-1}", -1);
Accept("{\"delta\":20}", 20);
Accept("{\"delta\":-20}", -20);
foreach (var invalid in new[] { "{}", "null", "[]", "1", "{\"delta\":0}", "{\"delta\":21}", "{\"delta\":-21}", "{\"delta\":1.5}", "{\"delta\":\"1\"}", "{\"delta\":true}", "{\"delta\":null}", "{\"delta\":1e100}", "{\"delta\":2147483648}" }) Reject(invalid);

Near(SystemVolumePolicy.AdjustScalar(.5f, 1), .52f, "上滚增加两个百分点");
Near(SystemVolumePolicy.AdjustScalar(.5f, -1), .48f, "下滚减少两个百分点");
Near(SystemVolumePolicy.AdjustScalar(.373f, 1), .393f, "增量保留当前设备音量的小数");
Near(SystemVolumePolicy.AdjustScalar(.94f, 20), 1f, "上限饱和");
Near(SystemVolumePolicy.AdjustScalar(.06f, -20), 0f, "下限饱和");
Near(SystemVolumePolicy.AdjustScalar(1f, 1), 1f, "已经满音量不会越界");
Near(SystemVolumePolicy.AdjustScalar(0f, -1), 0f, "已经零音量不会越界");
Near(SystemVolumePolicy.AdjustScalar(.15f, 1), .17f, "使用外部最新音量，不沿用前一次计算");
Check(SystemVolumePolicy.ToPercent(.373f) == 37, "回传音量百分比");
Check(SystemVolumePolicy.ToPercent(-.1f) == 0 && SystemVolumePolicy.ToPercent(1.1f) == 100, "显示百分比限于零到一百");
foreach (var invalid in new[] { 0, 21, -21, int.MinValue, int.MaxValue }) Throws(() => SystemVolumePolicy.AdjustScalar(.5f, invalid), "计算必须拒绝越界增量");
foreach (var invalid in new[] { float.NaN, float.PositiveInfinity, float.NegativeInfinity })
{
    Throws(() => SystemVolumePolicy.AdjustScalar(invalid, 1), "计算必须拒绝非有限设备音量");
    Throws(() => SystemVolumePolicy.ToPercent(invalid), "显示必须拒绝非有限设备音量");
}
Console.WriteLine($"系统音量逻辑检查通过：{checks} 项（未访问或改变系统输出设备）。");
