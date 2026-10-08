// Arc-style component kit. Each component lives in components/arc/<name>/<name>.tsx so the
// real uiarc.dev registry files can replace them one by one.
export { Button, IconButton, type ButtonProps } from "./button/button";
export { Input, Textarea, Field } from "./input/input";
export { Select, type SelectOption } from "./select/select";
export { Combobox, type ComboboxOption } from "./combobox/combobox";
export { Checkbox } from "./checkbox/checkbox";
export { Switch } from "./switch/switch";
export { Badge, type BadgeTone } from "./badge/badge";
export { Avatar, AvatarGroup, colorFor } from "./avatar/avatar";
export { Dialog, ConfirmDialog } from "./dialog/dialog";
export { Sheet } from "./sheet/sheet";
export { Menu, type MenuItem } from "./menu/menu";
export { Popover } from "./popover/popover";
export { Tooltip } from "./tooltip/tooltip";
export { Tabs, type TabItem } from "./tabs/tabs";
export { SegmentedControl } from "./segmented-control/segmented-control";
export { Kbd } from "./kbd/kbd";
export { Toaster, toast } from "./toast/toast";
export { Spinner, Loading } from "./spinner/spinner";
export { Skeleton, SkeletonRows } from "./skeleton/skeleton";
export { EmptyState, ErrorState } from "./empty-state/empty-state";
export { DatePicker } from "./date-picker/date-picker";
export { Calendar } from "./date-picker/calendar";
export { DateRangePicker, presetRange, PRESETS, type DateRange } from "./date-range-picker/date-range-picker";
