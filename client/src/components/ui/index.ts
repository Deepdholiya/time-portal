// The app's component layer. Every control renders an official Arc component from uiarc.dev (vendored in components/arc),
// adapted to the props the pages use and themed to look like Linear (styles/arc-theme.css).
export { Button, IconButton, type ButtonProps } from "./button";
export { Input, Textarea, Field } from "./field";
export { Select, type SelectOption } from "./select";
export { Combobox, type ComboboxOption } from "./combobox";
export { Checkbox, Switch } from "./toggles";
export { Badge, type BadgeTone } from "./badge";
export { Avatar, AvatarGroup, colorFor } from "./avatar";
export { Dialog, ConfirmDialog, Sheet } from "./overlays";
export { Menu, type MenuItem } from "./menu";
export { Popover } from "./popover";
export { Tooltip } from "./tooltip";
export { Tabs, SegmentedControl, type TabItem } from "./tabs";
export { Toaster, toast } from "./toast";
export { Spinner, Loading, Skeleton, SkeletonRows, EmptyState, ErrorState, Kbd } from "./feedback";
export { DatePicker, DateRangePicker, presetRange, PRESETS, type DateRange } from "./dates";
