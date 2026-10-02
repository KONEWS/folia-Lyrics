using System.Drawing;
using System.Windows.Forms;

// test/transparent-host/Program.cs: a local, visible target for verifying genuine transparency and click-through.
internal static class Program
{
    [STAThread] private static void Main()
    {
        ApplicationConfiguration.Initialize();
        using var form = new Form { Text = "folia-Lyrics 透明与点击验证", StartPosition = FormStartPosition.CenterScreen,
            ClientSize = new Size(1200, 760), BackColor = Color.FromArgb(232, 239, 247) };
        var count = 0;
        var button = new Button { Text = "点击验证：0", Location = new Point(410, 310), Size = new Size(380, 100),
            Font = new Font("Microsoft YaHei UI", 24), BackColor = Color.LightSkyBlue, AccessibleName = "点击验证：0" };
        button.Click += (_, _) => { count++; button.Text = button.AccessibleName = $"点击验证：{count}"; };
        form.Controls.Add(button);
        form.Paint += (_, e) => {
            using var font = new Font("Microsoft YaHei UI", 22);
            using var brush = new SolidBrush(Color.FromArgb(35, 55, 82));
            e.Graphics.DrawString("后方真实窗口 · 文字与色块应清晰可见", font, brush, 100, 110);
            e.Graphics.FillRectangle(Brushes.Coral, 100, 200, 220, 60);
            e.Graphics.FillRectangle(Brushes.SkyBlue, 440, 200, 220, 60);
            e.Graphics.FillRectangle(Brushes.MediumSeaGreen, 780, 200, 220, 60);
            e.Graphics.DrawString("启用穿透后，前方歌词仍显示；点击按钮，计数应增加。", font, brush, 100, 540);
        };
        Application.Run(form);
    }
}
