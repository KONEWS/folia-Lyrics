// native/TrayMenuAccessibility.cs — expose every painted row as a named, invokable menu item.
namespace FoliaLyrics;
internal sealed partial class TrayMenu
{
    protected override AccessibleObject CreateAccessibilityInstance() => new MenuAccessibility(this);
    private sealed class MenuAccessibility(TrayMenu menu) : ControlAccessibleObject(menu)
    {
        private readonly AccessibleObject[] items = Enumerable.Range(0, TrayMenuLayout.Labels.Length).Select(index => (AccessibleObject)new ItemAccessibility(menu, index)).ToArray();
        public override AccessibleRole Role => AccessibleRole.MenuPopup;
        public override int GetChildCount() => items.Length;
        public override AccessibleObject? GetChild(int index) => index >= 0 && index < items.Length ? items[index] : null;
        public override AccessibleObject? GetFocused() => menu.Visible && menu.ContainsFocus && menu.selected >= 0 ? items[menu.selected] : null;
    }
    private sealed class ItemAccessibility(TrayMenu menu, int index) : AccessibleObject
    {
        public override string? Name { get => TrayMenuLayout.Labels[index]; set { } }
        public override AccessibleRole Role => AccessibleRole.MenuItem;
        public override AccessibleObject? Parent => menu.AccessibilityObject;
        public override string? DefaultAction => "执行";
        public override string? KeyboardShortcut => index == 1 ? "Ctrl+Alt+L" : null;
        public override Rectangle Bounds => menu.RectangleToScreen(TrayMenuLayout.Item(index, menu.scale));
        public override AccessibleStates State => AccessibleStates.Focusable | AccessibleStates.Selectable
            | (menu.Visible ? AccessibleStates.None : AccessibleStates.Invisible)
            | (menu.selected == index ? AccessibleStates.Selected : AccessibleStates.None)
            | (menu.selected == index && menu.Visible && menu.ContainsFocus ? AccessibleStates.Focused : AccessibleStates.None)
            | (index == 2 && menu.topmost ? AccessibleStates.Checked : AccessibleStates.None);
        public override AccessibleObject? Navigate(AccessibleNavigation direction) => direction switch
        {
            AccessibleNavigation.Next or AccessibleNavigation.Down => menu.AccessibilityObject.GetChild(index + 1),
            AccessibleNavigation.Previous or AccessibleNavigation.Up => menu.AccessibilityObject.GetChild(index - 1),
            _ => base.Navigate(direction)
        };
        public override void DoDefaultAction() => menu.InvokeItem(index);
        public override void Select(AccessibleSelection flags) { if ((flags & (AccessibleSelection.TakeFocus | AccessibleSelection.TakeSelection)) != 0) menu.SelectItem(index); }
    }
}
