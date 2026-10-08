import type { ReactNode } from "react";
import { Tabs as ArcTabs, TabsList, TabsTrigger } from "../arc/tabs/tabs";
import ArcSegmentedControl from "../arc/segmented-control/segmented-control";
import s from "./ui.module.css";

export interface TabItem { value: string; label: ReactNode; count?: number; icon?: ReactNode; hidden?: boolean }

/** Arc Tabs as a view switcher. Panels stay with the caller, so only the list is rendered. */
export function Tabs({ items, value, onChange, className }: { items: TabItem[]; value: string; onChange: (v: string) => void; variant?: "pill" | "underline"; className?: string }) {
  return (
    <ArcTabs value={value} onValueChange={onChange} className={className}>
      <TabsList>
        {items.filter((t) => !t.hidden).map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            <span className={s.tabLabel}>{t.icon}{t.label}{t.count !== undefined && <span className={s.tabCount}>{t.count}</span>}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </ArcTabs>
  );
}

/** Arc SegmentedControl. Labels may carry an icon. */
export function SegmentedControl<T extends string>({ options, value, onChange, "aria-label": ariaLabel }: { options: { value: T; label: ReactNode; icon?: ReactNode; title?: string }[]; value: T; onChange: (v: T) => void; "aria-label"?: string }) {
  return (
    <ArcSegmentedControl
      label={ariaLabel}
      value={value}
      onValueChange={(v) => onChange(v as T)}
      // Arc types the label as text but renders any node, which keeps icon-only segments like the chart switcher.
      options={options.map((o) => ({ value: o.value, label: (o.icon ? <span className={s.tabLabel} title={o.title}>{o.icon}{o.label}</span> : o.label) as unknown as string }))}
    />
  );
}
