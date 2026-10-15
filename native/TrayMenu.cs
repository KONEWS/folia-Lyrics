// native/TrayMenu.cs — native transient acrylic flyout with pointer, keyboard and accessible menu commands.
namespace FoliaLyrics;
internal sealed partial class TrayMenu : Form
{
    private readonly Action<TrayMenuAction> execute;
    private AcrylicCanvas? canvas;
    private float scale = 1;
    private int selected = -1;
    private Point anchor;
    private bool topmost, acrylic, forceSolid, recoveryShortcutAvailable = true;
    internal bool AcrylicActive => acrylic;
    internal int SelectedIndex => selected;
    internal TrayMenu(Action<TrayMenuAction> execute)
    {
        this.execute = execute;
        Text = "Folia 托盘菜单"; AccessibleName = Text; AccessibleRole = AccessibleRole.MenuPopup;
        AutoScaleMode = AutoScaleMode.None; FormBorderStyle = FormBorderStyle.None; ShowInTaskbar = false; TopMost = true;
        StartPosition = FormStartPosition.Manual; SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint, true);
    }
    internal void Open(Point position, bool pinned, IWin32Window? owner = null, bool solid = false, bool recoveryShortcutAvailable = true)
    {
        if (Visible) { Hide(); return; }
        topmost = pinned; forceSolid = solid; this.recoveryShortcutAvailable = recoveryShortcutAvailable; selected = -1; anchor = position;
        // Create the handle before measuring; Windows uses the same DPI coordinate space for pointer and working area.
        _ = Handle; ResizeMenu(); Location = TrayMenuLayout.Position(anchor, Size, Screen.FromPoint(anchor).WorkingArea);
        ApplyMaterial(); if (owner is null) Show(); else Show(owner); Activate(); Focus(); Invalidate();
    }
    protected override CreateParams CreateParams
    {
        get { var parameters = base.CreateParams; parameters.Style |= 0x00C00000; parameters.ExStyle |= 0x80; return parameters; }
    }
    protected override void OnHandleCreated(EventArgs e) { base.OnHandleCreated(e); ResizeMenu(); }
    private void ResizeMenu()
    {
        scale = DeviceDpi / 96f;
        Size = new((int)Math.Ceiling(TrayMenuLayout.Width * scale), (int)Math.Ceiling(TrayMenuLayout.Height * scale));
        canvas?.Dispose(); canvas = null;
    }
    private void ApplyMaterial()
    {
        acrylic = WindowAcrylic.Apply(Handle, !forceSolid && WindowAcrylic.TransparencyEnabled());
        BackColor = acrylic ? Color.Black : SystemInformation.HighContrast ? SystemColors.Menu : Color.FromArgb(35, 38, 48);
    }
    protected override void OnPaintBackground(PaintEventArgs e) { }
    protected override void OnPaint(PaintEventArgs e)
    {
        canvas ??= new AcrylicCanvas(ClientSize);
        canvas.Paint(e.Graphics, graphics => TrayMenuDrawing.Draw(graphics, scale, acrylic, topmost, selected, recoveryShortcutAvailable));
    }
    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e); SelectItem(Hit(e.Location));
    }
    protected override void OnMouseLeave(EventArgs e) { base.OnMouseLeave(e); SelectItem(-1); }
    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e); if (e.Button == MouseButtons.Left && Hit(e.Location) is var index && index >= 0) InvokeItem(index);
    }
    private int Hit(Point point) => Enumerable.Range(0, TrayMenuLayout.Labels.Length).FirstOrDefault(index => TrayMenuLayout.Item(index, scale).Contains(point), -1);
    private void SelectItem(int index)
    {
        if (selected == index) return;
        selected = index; Invalidate();
        if (index >= 0 && Visible && ContainsFocus) AccessibilityNotifyClients(AccessibleEvents.Focus, index + 1);
    }
    internal void InvokeItem(int index)
    {
        if (index < 0 || index >= TrayMenuLayout.Labels.Length) return;
        Hide(); execute((TrayMenuAction)index);
    }
    protected override bool ProcessCmdKey(ref Message message, Keys keyData)
    {
        switch (keyData)
        {
            case Keys.Down: SelectItem(TrayMenuLayout.Next(selected, 1)); return true;
            case Keys.Up: SelectItem(selected < 0 ? TrayMenuLayout.Labels.Length - 1 : TrayMenuLayout.Next(selected, -1)); return true;
            case Keys.Home: SelectItem(0); return true;
            case Keys.End: SelectItem(TrayMenuLayout.Labels.Length - 1); return true;
            case Keys.Enter:
            case Keys.Space: if (selected >= 0) InvokeItem(selected); return true;
            case Keys.Escape:
            case Keys.Tab:
            case Keys.Shift | Keys.Tab: Hide(); return true;
        }
        return base.ProcessCmdKey(ref message, keyData);
    }
    protected override void OnDeactivate(EventArgs e) { base.OnDeactivate(e); Hide(); }
    protected override void OnDpiChanged(DpiChangedEventArgs e)
    {
        base.OnDpiChanged(e); ResizeMenu(); Location = TrayMenuLayout.Position(anchor, Size, Screen.FromPoint(anchor).WorkingArea); Invalidate();
    }
    protected override void WndProc(ref Message message)
    {
        // Use the MSAA proxy for painted rows; WinForms' native UIA provider has no child fragments here.
        if (message.Msg == 0x3D && unchecked((int)message.LParam.ToInt64()) == -25) { DefWndProc(ref message); return; }
        if (message.Msg == 0x83) { message.Result = IntPtr.Zero; return; }
        if (message.Msg == 0x85) { message.Result = IntPtr.Zero; return; }
        if (message.Msg == 0x86) message.LParam = new IntPtr(-1);
        base.WndProc(ref message);
        if (IsHandleCreated && message.Msg is 0x31E or 0x31A or 0x1A) { ApplyMaterial(); Invalidate(); }
    }
    protected override void Dispose(bool disposing)
    {
        if (disposing) { canvas?.Dispose(); canvas = null; }
        base.Dispose(disposing);
    }
}
