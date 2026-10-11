import { useState } from "react";
import { Download } from "lucide-react";
import { Button, Checkbox, Dialog, SegmentedControl } from "@/components/ui";
import { download } from "@/lib/api";
import s from "./export-dialog.module.css";

type Format = "xlsx" | "pdf" | "csv";
const DIMS = [
  { value: "employee", label: "Employee" }, { value: "project", label: "Project" }, { value: "subProject", label: "Sub-project" },
  { value: "client", label: "Client" }, { value: "task", label: "Task" }, { value: "team", label: "Team" },
  { value: "date", label: "Date" }, { value: "week", label: "Week" },
] as const;
const PRESETS: { label: string; dims: string[] }[] = [
  { label: "Employee", dims: ["employee"] }, { label: "Project", dims: ["project"] }, { label: "Project + sub-project", dims: ["project", "subProject"] },
  { label: "Client", dims: ["client"] }, { label: "Task", dims: ["task"] }, { label: "Employee + project", dims: ["employee", "project"] },
];

/**
 * Export the current filters to Excel, PDF or CSV. The summary is grouped by any combination of dimensions, in the order
 * they're picked (Employee then Project gives one row per person per project); every entry can be included too.
 */
export function ExportDialog({ open, onClose, query, initial = ["employee"] }: { open: boolean; onClose: () => void; query: Record<string, string>; initial?: string[] }) {
  const [format, setFormat] = useState<Format>("xlsx");
  const [dims, setDims] = useState<string[]>(initial);
  const [details, setDetails] = useState(true);
  const toggle = (d: string) => setDims((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  const label = (d: string) => DIMS.find((x) => x.value === d)?.label ?? d;
  const run = () => {
    download(`/reports/export.${format}`, { ...query, summary: dims.join(","), details: details ? "1" : "0" });
    onClose();
  };
  return (
    <Dialog
      open={open} onClose={onClose} title="Export time" size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={<Download size={14} />} onClick={run} disabled={!dims.length && !details}>Export</Button></>}
    >
      <div className={s.body}>
        <div className={s.section}>
          <div className={s.label}>Format</div>
          <SegmentedControl<Format> aria-label="Format" value={format} onChange={setFormat} options={[{ value: "xlsx", label: "Excel" }, { value: "pdf", label: "PDF" }, { value: "csv", label: "CSV" }]} />
        </div>
        <div className={s.section}>
          <div className={s.label}>Group the totals by</div>
          <div className={s.presets}>
            {PRESETS.map((p) => {
              const on = p.dims.join() === dims.join();
              return <button key={p.label} type="button" className={`${s.preset} ${on ? s.on : ""}`} aria-pressed={on} onClick={() => setDims(p.dims)}>{p.label}</button>;
            })}
          </div>
          <div className={s.hint}>Or combine your own, in order:</div>
          <div className={s.dims}>
            {DIMS.map((d) => {
              const i = dims.indexOf(d.value);
              return (
                <button key={d.value} type="button" className={`${s.dim} ${i >= 0 ? s.on : ""}`} aria-pressed={i >= 0} onClick={() => toggle(d.value)}>
                  {i >= 0 && <span className={s.order}>{i + 1}</span>}{d.label}
                </button>
              );
            })}
          </div>
          <div className={s.preview}>{dims.length ? <>One row per <span className="medium">{dims.map(label).join(" › ")}</span>, with hours, billable hours and entries.</> : "No grouped totals, just the entries."}</div>
        </div>
        <Checkbox checked={details} onChange={setDetails} label="Also include every entry" />
      </div>
    </Dialog>
  );
}
