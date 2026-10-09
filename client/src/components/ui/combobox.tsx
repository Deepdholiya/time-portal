import { useMemo, useState, type ReactElement, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Combobox as ArcCombobox } from "../arc/combobox/combobox";
import { MultiSelect } from "../arc/multi-select/multi-select";
import { Popover } from "./popover";
import { controlLabel, cx, ownsField, textOf, useField } from "./shared";
import s from "./ui.module.css";

export interface ComboboxOption { value: string | number; label: string; icon?: ReactNode; hint?: ReactNode; group?: string; keywords?: string }

interface Base {
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  size?: "sm" | "md";
  /** "chip" renders a borderless trigger for Linear-style property rows. */
  appearance?: "field" | "chip";
  /** Custom trigger element; receives the click toggle. */
  trigger?: ReactElement;
  width?: number;
  disabled?: boolean;
  emptyText?: string;
  className?: string;
  "aria-label"?: string;
}
interface Single extends Base { multiple?: false; value: string | number | null | undefined; onChange: (value: string | null) => void; clearable?: boolean; clearLabel?: string }
interface Multi extends Base { multiple: true; value: (string | number)[]; onChange: (value: string[]) => void }
export type ComboboxProps = Single | Multi;

/**
 * Form fields use Arc Combobox (single) and Arc MultiSelect (multiple). Linear-style property chips, toolbar filters and custom
 * triggers open a searchable list in an Arc Popover, since Arc's combobox is always a full-width labelled text field.
 */
export const Combobox = ownsField(function Combobox(props: ComboboxProps) {
  const field = useField();
  // Toolbar filters (a fixed width outside any Field) keep the compact picker too.
  if (props.appearance === "chip" || props.trigger || (props.width && !field)) return <Picker {...props} />;
  const { label, hidden } = controlLabel(field, props["aria-label"] ?? props.placeholder);
  const options = props.options.map((o) => ({ value: String(o.value), label: o.label, keywords: [o.keywords, o.group, textOf(o.hint)].filter(Boolean) as string[] }));
  const wrap = cx(hidden && s.srLabel, props.size === "sm" && s.sm, s.inputWrap);
  if (props.multiple) {
    return (
      <div className={wrap}>
        <MultiSelect label={label} options={options} value={props.value.map(String)} onValueChange={props.onChange} placeholder={props.placeholder ?? "Select…"} description={field?.error ?? field?.description} disabled={props.disabled} className={props.className} />
      </div>
    );
  }
  const { onChange } = props;
  return (
    <div className={wrap}>
      <ArcCombobox
        label={label}
        options={options}
        value={props.value == null ? "" : String(props.value)}
        onValueChange={(v) => onChange(v === "" ? null : v)}
        placeholder={props.placeholder ?? props.searchPlaceholder ?? "Search or select…"}
        emptyMessage={props.emptyText ?? "No matches"}
        description={field?.error ?? field?.description}
        disabled={props.disabled}
        className={props.className}
      />
    </div>
  );
});

/** Searchable single or multi picker in an Arc Popover, for chips and custom triggers. */
function Picker(props: ComboboxProps) {
  const { options, placeholder = "Select…", searchPlaceholder = "Search…", size = "md", appearance = "field", trigger, width, disabled, emptyText = "No matches", className } = props;
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const [open, setOpen] = useState(false);
  const selected = props.multiple ? props.value.map(String) : props.value == null || props.value === "" ? [] : [String(props.value)];
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? options.filter((o) => `${o.label} ${o.keywords ?? ""} ${o.group ?? ""}`.toLowerCase().includes(t)) : options;
  }, [q, options]);
  const clearRow = !props.multiple && props.clearable ? 1 : 0;

  const choose = (v: string | null, close: () => void) => {
    if (props.multiple) {
      if (v === null) return props.onChange([]);
      props.onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
    } else {
      props.onChange(v);
      close();
      setQ("");
    }
  };

  const current = options.filter((o) => selected.includes(String(o.value)));
  const label = current.length === 0 ? <span className={s.placeholder}>{placeholder}</span>
    : current.length === 1 ? <>{current[0].icon}{current[0].label}</>
    : <>{current[0].icon}{current[0].label} <span className="faint">+{current.length - 1}</span></>;

  const t = trigger ?? (
    <button type="button" disabled={disabled} aria-label={props["aria-label"]} className={cx(s.chip, size === "sm" && s.sm, appearance === "chip" && s.ghost, className)}>
      <span className={s.chipValue}>{label}</span>
      {appearance === "field" && <ChevronDown size={14} className="faint" />}
    </button>
  );

  let lastGroup: string | undefined;
  return (
    <Popover trigger={t} padded={false} width={width} open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); setHi(0); }}>
      {(close) => (
        <div className={s.panel}>
          <input
            className={s.search}
            placeholder={searchPlaceholder}
            value={q}
            onChange={(e) => { setQ(e.target.value); setHi(0); }}
            onKeyDown={(e) => {
              const n = filtered.length + clearRow;
              if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => (h + 1) % Math.max(1, n)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => (h - 1 + n) % Math.max(1, n)); }
              else if (e.key === "Enter") {
                e.preventDefault();
                if (clearRow && hi === 0) choose(null, close);
                else { const o = filtered[hi - clearRow]; if (o) choose(String(o.value), close); }
              }
            }}
          />
          <div className={s.list} role="listbox" aria-multiselectable={props.multiple || undefined}>
            {clearRow > 0 && (
              <div className={cx(s.option, hi === 0 && s.hi)} onMouseEnter={() => setHi(0)} onClick={() => choose(null, close)}>
                <span className={cx(s.label, "faint")}>{(props as Single).clearLabel ?? "None"}</span>
                {selected.length === 0 && <Check size={14} className={s.check} />}
              </div>
            )}
            {filtered.map((o, i) => {
              const on = selected.includes(String(o.value));
              const header = o.group && o.group !== lastGroup ? <div className={s.group}>{o.group}</div> : null;
              lastGroup = o.group;
              return (
                <div key={o.value}>
                  {header}
                  <div role="option" aria-selected={on} className={cx(s.option, hi === i + clearRow && s.hi)} onMouseEnter={() => setHi(i + clearRow)} onClick={() => choose(String(o.value), close)}>
                    {props.multiple && <span className={cx(s.box, on && s.on)}>{on && <Check size={10} strokeWidth={3} />}</span>}
                    {o.icon}
                    <span className={s.label}>{o.label}</span>
                    {o.hint && <span className={s.optHint}>{o.hint}</span>}
                    {!props.multiple && on && <Check size={14} className={s.check} />}
                  </div>
                </div>
              );
            })}
            {!filtered.length && <div className={s.empty}>{emptyText}</div>}
          </div>
          {props.multiple && selected.length > 0 && (
            <div className={s.pickerFooter}>
              <button type="button" className="link small" style={{ background: "none", border: 0, padding: "4px 8px" }} onClick={() => props.onChange([])}>Clear</button>
              <button type="button" className="link small" style={{ background: "none", border: 0, padding: "4px 8px" }} onClick={close}>Done</button>
            </div>
          )}
        </div>
      )}
    </Popover>
  );
}
