import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronRight, ListFilter, Minus, Search } from "lucide-react";
import { Button, Popover } from "@/components/ui";
import s from "./filter-menu.module.css";

export interface FilterOption { value: string; label: string; icon?: ReactNode; hint?: string; keywords?: string }
export interface FilterSection {
  key: string; label: string; icon?: ReactNode; options: FilterOption[];
  /** One value at most (radio). */
  single?: boolean;
  /** A single-choice section that always has a value, such as Rows. Not counted as a filter. */
  required?: boolean;
  /** Value Clear all resets a required section to. */
  defaultValue?: string;
  /** Everything is on unless turned off (layers to show). Counts what's hidden; Clear all turns everything back on. */
  allByDefault?: boolean;
}
export type FilterValues = Record<string, string[]>;

export const filterCount = (sections: FilterSection[], v: FilterValues) =>
  sections.reduce((n, sec) => n + (sec.allByDefault ? sec.options.length - (v[sec.key]?.length ?? 0) : sec.required ? (v[sec.key]?.[0] && v[sec.key][0] !== sec.defaultValue ? 1 : 0) : (v[sec.key]?.length ?? 0)), 0);

/**
 * The one Filter button used across the app: a bordered button that opens a dropdown with every filter as a
 * collapsible section. Multi-select sections have Select all. Choices are applied together with Apply.
 */
export function FilterMenu({ sections, value, onApply, label = "Filter", width = 340, placement = "bottom-end", footer }: {
  sections: FilterSection[]; value: FilterValues; onApply: (v: FilterValues) => void; label?: string; width?: number; placement?: "bottom-start" | "bottom-end"; footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FilterValues>(value);
  const [expanded, setExpanded] = useState<string | null>(null);
  const count = filterCount(sections, value);
  const onOpenChange = (v: boolean) => {
    if (v) { setDraft(value); setExpanded(sections.find((x) => x.required || value[x.key]?.length)?.key ?? sections[0]?.key ?? null); }
    setOpen(v);
  };
  const clearAll = () => setDraft(Object.fromEntries(sections.map((x) => [x.key, x.allByDefault ? x.options.map((o) => o.value) : x.required && x.defaultValue ? [x.defaultValue] : []])));
  const apply = () => { onApply(draft); setOpen(false); };

  return (
    <Popover
      open={open} onOpenChange={onOpenChange} placement={placement} padded={false} width={width}
      trigger={
        <Button size="sm" variant="secondary" icon={<ListFilter size={14} />} aria-label={count ? `${label}, ${count} on` : label}>
          {label}{count > 0 && <span className={s.count}>{count}</span>}
        </Button>
      }
    >
      <div className={s.menu} role="dialog" aria-label="Filters">
        <div className={s.head}>
          <span className="medium">Filters</span>
          <span className="grow" />
          <button type="button" className={s.link} onClick={clearAll}>Clear all</button>
        </div>
        <div className={s.body}>
          {sections.map((sec) => (
            <Section key={sec.key} sec={sec} value={draft[sec.key] ?? []} open={expanded === sec.key}
              onToggle={() => setExpanded(expanded === sec.key ? null : sec.key)}
              onChange={(v) => setDraft((d) => ({ ...d, [sec.key]: v }))} />
          ))}
        </div>
        {footer && <div className={s.extra}>{footer}</div>}
        <div className={s.foot}>
          <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" variant="primary" onClick={apply}>Apply</Button>
        </div>
      </div>
    </Popover>
  );
}

function Section({ sec, value, open, onToggle, onChange }: { sec: FilterSection; value: string[]; open: boolean; onToggle: () => void; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? sec.options.filter((o) => `${o.label} ${o.hint ?? ""} ${o.keywords ?? ""}`.toLowerCase().includes(t)) : sec.options;
  }, [q, sec.options]);
  const picked = new Set(value);
  const summary = !value.length ? (sec.required ? "" : "Any")
    : value.length === 1 ? sec.options.find((o) => o.value === value[0])?.label ?? "1 selected"
    : value.length === sec.options.length ? "All" : `${value.length} selected`;
  const allOn = shown.length > 0 && shown.every((o) => picked.has(o.value));
  const someOn = shown.some((o) => picked.has(o.value));
  const toggleAll = () => {
    const ids = shown.map((o) => o.value);
    onChange(allOn ? value.filter((v) => !ids.includes(v)) : [...new Set([...value, ...ids])]);
  };
  const pick = (v: string) => {
    if (sec.single) onChange(picked.has(v) && !sec.required ? [] : [v]);
    else onChange(picked.has(v) ? value.filter((x) => x !== v) : [...value, v]);
  };
  return (
    <div className={s.section}>
      <button type="button" className={s.sectionHead} aria-expanded={open} onClick={onToggle}>
        {open ? <ChevronDown size={14} className="faint" /> : <ChevronRight size={14} className="faint" />}
        {sec.icon && <span className={s.icon}>{sec.icon}</span>}
        <span className="medium">{sec.label}</span>
        <span className="grow" />
        <span className={`${s.summary} ${value.length && summary !== "Any" ? s.on : ""}`}>{summary}</span>
      </button>
      {open && (
        <div className={s.options}>
          {sec.options.length > 8 && (
            <label className={s.search}><Search size={13} className="faint" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${sec.label.toLowerCase()}…`} aria-label={`Search ${sec.label}`} /></label>
          )}
          {!sec.single && shown.length > 1 && (
            <button type="button" className={`${s.option} ${s.all}`} role="checkbox" aria-checked={allOn ? true : someOn ? "mixed" : false} onClick={toggleAll}>
              <span className={`${s.box} ${allOn || someOn ? s.boxOn : ""}`}>{allOn ? <Check size={11} /> : someOn ? <Minus size={11} /> : null}</span>
              Select all
            </button>
          )}
          {shown.map((o) => {
            const on = picked.has(o.value);
            return (
              <button key={o.value} type="button" className={s.option} role={sec.single ? "radio" : "checkbox"} aria-checked={on} onClick={() => pick(o.value)}>
                <span className={`${sec.single ? s.radio : s.box} ${on ? s.boxOn : ""}`}>{on && (sec.single ? <span className={s.dot} /> : <Check size={11} />)}</span>
                {o.icon}
                <span className="ellipsis grow">{o.label}</span>
                {o.hint && <span className="faint small">{o.hint}</span>}
              </button>
            );
          })}
          {!shown.length && <div className="faint small" style={{ padding: "6px 10px" }}>No matches</div>}
        </div>
      )}
    </div>
  );
}
