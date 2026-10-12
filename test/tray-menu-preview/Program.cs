using FoliaLyrics;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Runtime.CompilerServices;
using System.Text.Json;

// test/tray-menu-preview/Program.cs — interactive isolated verification of the production tray menu and real DWM backdrop.
Application.SetHighDpiMode(HighDpiMode.PerMonitorV2); Application.EnableVisualStyles();
Application.SetCompatibleTextRenderingDefault(false);
if (args.Contains("--checks", StringComparer.Ordinal)) { Environment.ExitCode = TrayMenuChecks.Run(); return; }
Application.Run(new PreviewWindow());
internal sealed class PreviewWindow : Form
{
    private readonly TrayMenu menu;
    private readonly Label status = new() { AutoSize = true, ForeColor = Color.White, BackColor = Color.Transparent, Location = new(28, 110) };
    private readonly List<object> evidence = [];
    private bool pinned;
    internal PreviewWindow()
    {
        Text = "Folia 托盘亚克力隔离验证"; ClientSize = new(900, 620); StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.Dpi; DoubleBuffered = true;
        menu = new(action => { if (action == TrayMenuAction.Topmost) pinned = !pinned; status.Text = $"执行：{TrayMenuLayout.Labels[(int)action]} · 置顶：{pinned}"; evidence.Add(new { action = action.ToString(), pinned }); });
        menu.VisibleChanged += (_, _) => evidence.Add(new { kind = "visibility", visible = menu.Visible, selected = menu.SelectedIndex });
        var acrylic = new Button { Text = "打开亚克力菜单", Location = new(28, 28), Size = new(180, 44) };
        var solid = new Button { Text = "打开纯色回退", Location = new(226, 28), Size = new(180, 44) };
        acrylic.Click += (_, _) => OpenMenu(false); solid.Click += (_, _) => OpenMenu(true);
        Controls.AddRange([acrylic, solid, status]); status.Text = "仅验证菜单，不启动播放器、不读取应用配置。";
        FormClosed += (_, _) => { menu.Dispose(); SaveEvidence(); };
    }
    private void OpenMenu(bool solid)
    {
        menu.Open(PointToScreen(new(820, 510)), pinned, this, solid);
        var backdrop = 0; DwmGetWindowAttribute(menu.Handle, 38, out backdrop, sizeof(int));
        DwmIsCompositionEnabled(out var composition);
        var items = menu.AccessibilityObject;
        evidence.Add(new { kind = "open", solid, acrylic = menu.AcrylicActive, backdrop, composition,
            dpi = menu.DeviceDpi, bounds = menu.Bounds.ToString(), items = Enumerable.Range(0, items.GetChildCount()).Select(index => new { name = items.GetChild(index)?.Name, role = items.GetChild(index)?.Role.ToString() }).ToArray() });
        status.Text = $"原生材质：{(menu.AcrylicActive ? "亚克力" : "纯色")} · DWM 类型：{backdrop} · DPI：{menu.DeviceDpi}";
    }
    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        using var gradient = new LinearGradientBrush(ClientRectangle, Color.FromArgb(34, 45, 90), Color.FromArgb(134, 51, 92), 20);
        e.Graphics.FillRectangle(gradient, ClientRectangle);
        using var font = new Font("Microsoft YaHei UI", 15, FontStyle.Bold);
        for (var x = 440; x < 900; x += 50) for (var y = 170; y < 620; y += 50)
        {
            using var brush = new SolidBrush((x / 50 + y / 50) % 2 == 0 ? Color.FromArgb(210, 98, 129) : Color.FromArgb(59, 105, 165));
            e.Graphics.FillRectangle(brush, x, y, 50, 50); e.Graphics.DrawString("F", font, Brushes.White, x + 16, y + 12);
        }
    }
    private void SaveEvidence()
    {
        var output = Environment.GetEnvironmentVariable("FOLIA_TRAY_EVIDENCE") ?? DefaultEvidence();
        if (!string.IsNullOrWhiteSpace(output)) { Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(output))!); File.WriteAllText(output, JsonSerializer.Serialize(evidence, new JsonSerializerOptions { WriteIndented = true })); }
    }
    private static string DefaultEvidence([CallerFilePath] string source = "") => Path.GetFullPath(Path.Combine(Path.GetDirectoryName(source)!, "..", "..", "test-results", "tray-menu", "material.json"));
    [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr handle, int attribute, out int value, int size);
    [DllImport("dwmapi.dll")] private static extern int DwmIsCompositionEnabled(out bool enabled);
}
