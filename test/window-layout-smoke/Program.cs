using FoliaLyrics;
using System.Drawing;
using System.Windows.Forms;

// test/window-layout-smoke/Program.cs — gesture bursts, exact final bounds, minimized retention and lifecycle cleanup.
var count = 0;
void Check(bool condition, string label)
{
    if (!condition) throw new Exception("FAIL " + label);
    count++; Console.WriteLine("PASS " + label);
}
var window = new MainWindow();
Check(window.Web.Bounds == new Rectangle(0, 0, 1200, 760), "first viewport fills the client rectangle");
window.Web.Changes.Clear(); window.BeginGesture();
for (var i = 0; i < 100; i++) window.ResizeTo(900 + i, 600 + i);
Check(window.Web.Changes.Count == 0 && window.Pending, "100 edge-drag messages schedule one pending update");
window.Tick();
Check(window.Web.Changes.Count == 1 && window.Web.Bounds == new Rectangle(0, 0, 999, 699) && !window.Pending, "one timer tick applies only the latest rectangle");
window.ResizeTo(1040, 740); window.EndGesture();
Check(window.Web.Changes.Count == 2 && window.Web.Bounds.Size == new Size(1040, 740) && !window.Pending, "releasing the edge flushes exact final bounds immediately");
window.Tick(); window.ResizeTo(1040, 740);
Check(window.Web.Changes.Count == 2, "no trailing duplicate update after the gesture or an equal resize");
window.ResizeTo(1280, 800);
Check(window.Web.Bounds.Size == new Size(1280, 800) && !window.Pending, "maximize/fullscreen/programmatic resize is immediate");
window.BeginGesture(); window.ResizeTo(1100, 700); window.WindowState = FormWindowState.Minimized; window.ResizeTo(0, 0); window.Tick(); window.EndGesture();
Check(window.Web.Bounds.Size == new Size(1280, 800) && !window.Pending, "minimize never collapses the viewport, including a pending gesture tick");
window.WindowState = FormWindowState.Normal; window.ResizeTo(1100, 700);
Check(window.Web.Bounds.Size == new Size(1100, 700), "restore applies the current nonzero client rectangle");
window.ResizeTo(0, 0);
Check(window.Web.Bounds.Size == new Size(1100, 700), "transient zero rectangles do not discard the last valid viewport");
window.BeginGesture(); window.ResizeTo(900, 600); window.Close(); window.Tick();
Check(!window.Pending && window.Web.Bounds.Size == new Size(1100, 700), "closing disposes pending layout work");
var disposed = new MainWindow(); disposed.Web.IsDisposed = true; disposed.ResizeTo(1000, 700);
Check(!disposed.Pending && disposed.Web.Bounds.Size == new Size(1200, 760), "disposed browser is untouched");
var closing = new MainWindow(); closing.Disposing = true; closing.ResizeTo(1000, 700);
Check(closing.Web.Bounds.Size == new Size(1200, 760), "closing form is untouched");
var gone = new MainWindow(); gone.IsDisposed = true; gone.ResizeTo(1000, 700);
Check(gone.Web.Bounds.Size == new Size(1200, 760), "disposed form is untouched");
Console.WriteLine($"{count} window-layout checks passed");
