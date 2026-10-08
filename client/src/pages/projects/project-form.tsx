import { useState } from "react";
import { FileStack, Plus, X } from "lucide-react";
import { Avatar, Button, Combobox, DatePicker, Dialog, Field, IconButton, Input, SegmentedControl, Select, Textarea, toast } from "@/components/arc";
import { PRIORITIES, PRIORITY_META, PriorityIcon } from "@/components/app/icons";
import { post, put } from "@/lib/api";
import { invalidate } from "@/lib/hooks";
import { today } from "@/lib/format";
import { useMe } from "@/lib/session";
import { useOptions } from "../tasks/lib";
import { BILLING, BILLING_TYPES, PROJECT_STATUS, PROJECT_STATUSES, cleanLinks, type BillingType, type Links, type Project, type ProjectStatus } from "./lib";
import s from "./projects.module.css";
import "../tasks/layer-fix.css";

const COLORS = ["#5e6ad2", "#26b5ce", "#4cb782", "#f2c94c", "#f2994a", "#eb5757", "#bb87fc", "#95a2b3"];

interface Form {
  name: string; code: string; description: string; color: string; status: ProjectStatus; priority: string;
  clientMode: "existing" | "new"; clientId: number | null; clientName: string; clientEmail: string; contactName: string; phone: string;
  managerId: number | null; teamId: number | null; memberIds: number[]; startDate: string | null; endDate: string | null;
  estimatedHours: string; budget: string; billingType: BillingType; hourlyRate: string; tags: string[]; links: Required<Pick<Links, "figma" | "document" | "drive">> & { other: { label: string; url: string }[] };
  subprojects: string[];
}

const num = (v: string) => (v.trim() === "" ? null : Number(v));
const validUrl = (u: string) => { try { const x = new URL(u); return x.protocol === "http:" || x.protocol === "https:"; } catch { return false; } };

/** Create / edit project (and sub-project) form per MGR-P10..P12, with "from template" when creating. */
export function ProjectFormDialog({ project, parentId, onClose, onSaved }: { project?: Project; parentId?: number; onClose: () => void; onSaved: (id: number) => void }) {
  const { me, can } = useMe();
  const fin = can("financials", "view");
  const opts = useOptions();
  const editing = !!project;
  const sub = !!parentId || (!!project && (project as { parentId?: number | null }).parentId != null);
  const [mode, setMode] = useState<"blank" | "template">("blank");
  const [f, setF] = useState<Form>(() => ({
    name: project?.name ?? "", code: project?.code ?? "", description: project?.description ?? "", color: project?.color ?? COLORS[0], status: project?.status ?? (sub ? "ACTIVE" : "PLANNING"),
    priority: project?.priority ?? "MEDIUM", clientMode: "existing", clientId: project?.client?.id ?? null, clientName: "", clientEmail: project?.client?.email ?? "",
    contactName: project?.client?.contactName ?? "", phone: project?.client?.phone ?? "", managerId: project?.manager?.id ?? (editing || sub ? null : me.user.id), teamId: project?.team?.id ?? null,
    memberIds: project?.members.map((m) => m.id) ?? [], startDate: project?.startDate ?? null, endDate: project?.endDate ?? null,
    estimatedHours: project?.estimatedHours != null ? String(project.estimatedHours) : "", budget: project?.budget != null ? String(project.budget) : "", billingType: project?.billingType ?? "HOURLY",
    hourlyRate: project?.hourlyRate != null ? String(project.hourlyRate) : "", tags: project?.tags ?? [],
    links: { figma: project?.links.figma ?? "", document: project?.links.document ?? "", drive: project?.links.drive ?? "", other: project?.links.other ?? [] },
    subprojects: [],
  }));
  const [tpl, setTpl] = useState<{ templateId: number | null; startDate: string }>({ templateId: null, startDate: today() });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const users = opts.data?.users ?? [];
  const templates = (opts.data?.templates ?? []).filter((t) => t.kind === "PROJECT");

  const validate = () => {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e.name = "Give the project a name";
    if (f.startDate && f.endDate && f.endDate < f.startDate) e.endDate = "End date must be after the start date";
    if (f.clientMode === "new" && !f.clientName.trim() && (f.clientEmail || f.contactName || f.phone)) e.clientName = "Add the client's name";
    if (f.clientEmail && !/^\S+@\S+\.\S+$/.test(f.clientEmail)) e.clientEmail = "Enter a valid email";
    for (const k of ["figma", "document", "drive"] as const) if (f.links[k].trim() && !validUrl(f.links[k].trim())) e[k] = "Enter a full URL starting with https://";
    f.links.other.forEach((o, i) => { if (o.url.trim() && !validUrl(o.url.trim())) e[`other${i}`] = "Enter a full URL"; });
    for (const [k, v] of [["estimatedHours", f.estimatedHours], ["budget", f.budget], ["hourlyRate", f.hourlyRate]] as const) if (v.trim() && (Number.isNaN(Number(v)) || Number(v) < 0)) e[k] = "Enter a positive number";
    setErrors(e);
    return !Object.keys(e).length;
  };

  const submit = async () => {
    if (mode === "template") {
      if (!tpl.templateId) { setErrors({ template: "Pick a template" }); return; }
      if (!f.name.trim()) { setErrors({ name: "Give the project a name" }); return; }
      setBusy(true);
      try {
        const p = await post<{ id: number }>("/projects/from-template", { templateId: tpl.templateId, name: f.name.trim(), startDate: tpl.startDate, clientId: f.clientId, managerId: f.managerId });
        invalidate("/projects"); invalidate("/options"); invalidate("/tasks");
        toast.success(`Created ${f.name.trim()} from template`);
        onSaved(p.id);
      } catch (e) { toast.error(e); } finally { setBusy(false); }
      return;
    }
    if (!validate()) return;
    const body = {
      name: f.name.trim(), code: f.code.trim() || null, description: f.description.trim() || null, color: f.color, status: f.status, priority: f.priority,
      startDate: f.startDate, endDate: f.endDate, estimatedHours: num(f.estimatedHours), billingType: f.billingType,
      ...(fin ? { budget: num(f.budget), hourlyRate: f.billingType === "HOURLY" ? num(f.hourlyRate) : null } : {}),
      tags: f.tags, links: cleanLinks(f.links),
      ...(f.clientMode === "existing" ? { clientId: f.clientId } : { clientId: null, clientName: f.clientName.trim() || undefined }),
      clientEmail: f.clientEmail.trim() || undefined, contactName: f.contactName.trim() || undefined, phone: f.phone.trim() || undefined,
      managerId: f.managerId, teamId: f.teamId, memberIds: f.memberIds,
      ...(parentId ? { parentId } : {}),
      ...(project?.initiative ? { initiativeId: project.initiative.id } : {}),
    };
    setBusy(true);
    try {
      let id: number;
      if (project) { await put(`/projects/${project.id}`, body); id = project.id; }
      else {
        const p = await post<{ id: number }>("/projects", body);
        id = p.id;
        for (const name of f.subprojects.map((x) => x.trim()).filter(Boolean)) await post("/projects", { name, parentId: id, clientId: body.clientId ?? undefined, managerId: f.managerId });
      }
      invalidate("/projects"); invalidate("/options"); invalidate("/clients");
      toast.success(project ? "Project saved" : `Created ${f.name.trim()}`);
      onSaved(id);
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  const title = project ? `Edit ${project.name}` : sub ? "New sub-project" : "New project";
  return (
    <Dialog
      open onClose={onClose} size="lg" title={title} onSubmit={submit}
      description={!project && !sub ? "Projects hold tasks, milestones and time. Clients see none of this unless you share a status link." : undefined}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>{project ? "Save changes" : mode === "template" ? "Create from template" : sub ? "Create sub-project" : "Create project"}</Button></>}
    >
      {!project && !sub && templates.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <SegmentedControl value={mode} onChange={setMode} aria-label="Start from"
            options={[{ value: "blank", label: "Blank project" }, { value: "template", label: "From template", icon: <FileStack size={13} /> }]} />
        </div>
      )}
      {mode === "template" ? (
        <div className="form-grid">
          <Field label="Template" required error={errors.template} className="full">
            <Select value={tpl.templateId ?? ""} onChange={(v) => setTpl({ ...tpl, templateId: v ? Number(v) : null })} placeholder="Choose a project template" options={templates.map((t) => ({ value: t.id, label: t.name }))} />
          </Field>
          <Field label="Project name" required error={errors.name} className="full"><Input autoFocus value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Greenleaf mobile site" /></Field>
          <Field label="Start date" hint="Milestones and task dates are placed relative to this."><DatePicker value={tpl.startDate} clearable={false} onChange={(v) => v && setTpl({ ...tpl, startDate: v })} fullWidth /></Field>
          <Field label="Client"><Select value={f.clientId ?? ""} onChange={(v) => set("clientId", v ? Number(v) : null)} placeholder="No client" options={[{ value: "", label: "No client" }, ...(opts.data?.clients ?? []).map((c) => ({ value: c.id, label: c.name }))]} /></Field>
          <Field label="Manager"><Select value={f.managerId ?? ""} onChange={(v) => set("managerId", v ? Number(v) : null)} options={[{ value: "", label: "No manager" }, ...users.filter((u) => u.role !== "EMPLOYEE").map((u) => ({ value: u.id, label: u.name }))]} /></Field>
        </div>
      ) : (
        <div className="col" style={{ gap: 20 }}>
          <div className="form-grid">
            <Field label="Name" required error={errors.name}><Input autoFocus value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={sub ? "e.g. iOS App" : "e.g. Website Redesign"} /></Field>
            <Field label="Project code" hint="Short reference used in reports"><Input value={f.code} maxLength={20} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="e.g. WEB" /></Field>
            <Field label="Description" className="full"><Textarea rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="What is this project about?" /></Field>
            <Field label="Status"><Select value={f.status} onChange={(v) => set("status", v as ProjectStatus)} options={PROJECT_STATUSES.map((x) => ({ value: x, label: PROJECT_STATUS[x].label }))} /></Field>
            <Field label="Priority">
              <Combobox value={f.priority} onChange={(v) => v && set("priority", v)} options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label, icon: <PriorityIcon priority={p} /> }))} />
            </Field>
            <Field label="Colour" className="full">
              <div className="row gap-4">{COLORS.map((c) => <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={f.color === c} className={`${s.colorSwatch} ${f.color === c ? s.colorOn : ""}`} style={{ background: c }} onClick={() => set("color", c)} />)}</div>
            </Field>
          </div>

          {!sub && (
            <section>
              <div className="section-title">Client</div>
              <div className="form-grid">
                <div className="full"><SegmentedControl value={f.clientMode} onChange={(v) => set("clientMode", v)} aria-label="Client" options={[{ value: "existing", label: "Existing client" }, { value: "new", label: "New client" }]} /></div>
                {f.clientMode === "existing" ? (
                  <Field label="Client" className="full"><Combobox value={f.clientId} clearable clearLabel="No client" placeholder="No client" onChange={(v) => set("clientId", v ? Number(v) : null)} options={(opts.data?.clients ?? []).map((c) => ({ value: c.id, label: c.name }))} /></Field>
                ) : (
                  <Field label="Client name" error={errors.clientName} className="full"><Input value={f.clientName} onChange={(e) => set("clientName", e.target.value)} placeholder="Company name" /></Field>
                )}
                <Field label="Client email" error={errors.clientEmail}><Input type="email" value={f.clientEmail} onChange={(e) => set("clientEmail", e.target.value)} placeholder="name@client.com" /></Field>
                <Field label="Contact name"><Input value={f.contactName} onChange={(e) => set("contactName", e.target.value)} /></Field>
                <Field label="Phone"><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
              </div>
            </section>
          )}

          <section>
            <div className="section-title">People and schedule</div>
            <div className="form-grid">
              <Field label="Manager"><Combobox value={f.managerId} clearable clearLabel="No manager" placeholder="No manager" onChange={(v) => set("managerId", v ? Number(v) : null)} options={users.map((u) => ({ value: u.id, label: u.name, icon: <Avatar name={u.name} size={16} /> }))} /></Field>
              <Field label="Team"><Select value={f.teamId ?? ""} onChange={(v) => set("teamId", v ? Number(v) : null)} options={[{ value: "", label: "No team" }, ...(opts.data?.teams ?? []).map((t) => ({ value: t.id, label: t.name }))]} /></Field>
              <Field label="Members" hint="Members can log time and see the project's tasks." className="full">
                <Combobox multiple value={f.memberIds} placeholder="Add members" onChange={(v) => set("memberIds", v.map(Number))} options={users.map((u) => ({ value: u.id, label: u.name, icon: <Avatar name={u.name} size={16} /> }))} />
              </Field>
              <Field label="Start date"><DatePicker value={f.startDate} onChange={(v) => set("startDate", v)} fullWidth placeholder="No start date" /></Field>
              <Field label="End date" error={errors.endDate}><DatePicker value={f.endDate} onChange={(v) => set("endDate", v)} fullWidth placeholder="No end date" /></Field>
              <Field label="Estimated hours" error={errors.estimatedHours}><Input inputMode="decimal" value={f.estimatedHours} onChange={(e) => set("estimatedHours", e.target.value)} suffix="h" /></Field>
            </div>
          </section>

          <section>
            <div className="section-title">Billing</div>
            <div className="form-grid">
              <Field label="Billing type" className={fin ? undefined : "full"}><Select value={f.billingType} onChange={(v) => set("billingType", v as BillingType)} options={BILLING_TYPES.map((b) => ({ value: b, label: BILLING[b] }))} /></Field>
              {fin && <Field label="Budget" error={errors.budget}><Input inputMode="decimal" value={f.budget} onChange={(e) => set("budget", e.target.value)} suffix={me.company.currency} /></Field>}
              {fin && f.billingType === "HOURLY" && <Field label="Hourly rate" error={errors.hourlyRate} hint="Overrides each person's default rate"><Input inputMode="decimal" value={f.hourlyRate} onChange={(e) => set("hourlyRate", e.target.value)} suffix={`${me.company.currency}/h`} /></Field>}
              {!fin && <p className="small faint full">Budgets and rates are managed by people with financial access.</p>}
            </div>
          </section>

          <section>
            <div className="section-title">Tags and links</div>
            <div className="form-grid">
              <Field label="Tags" className="full">
                <div className="row wrap gap-4">
                  {f.tags.map((t) => <span key={t} className={s.tagPill}>{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => set("tags", f.tags.filter((x) => x !== t))}><X size={11} /></button></span>)}
                  <Input size="sm" style={{ width: 160 }} value={tagDraft} placeholder="Add tag, Enter" list="tp-project-tags" onChange={(e) => setTagDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const t = tagDraft.trim(); if (t && !f.tags.includes(t)) set("tags", [...f.tags, t]); setTagDraft(""); } }} />
                  <datalist id="tp-project-tags">{(opts.data?.tags ?? []).map((t) => <option key={t} value={t} />)}</datalist>
                </div>
              </Field>
              <Field label="Figma" error={errors.figma}><Input value={f.links.figma} onChange={(e) => set("links", { ...f.links, figma: e.target.value })} placeholder="https://figma.com/…" /></Field>
              <Field label="Document" error={errors.document}><Input value={f.links.document} onChange={(e) => set("links", { ...f.links, document: e.target.value })} placeholder="https://docs…" /></Field>
              <Field label="Google Drive" error={errors.drive}><Input value={f.links.drive} onChange={(e) => set("links", { ...f.links, drive: e.target.value })} placeholder="https://drive.google.com/…" /></Field>
              <div className="field full">
                <span className="field-label">Other links</span>
                {f.links.other.map((o, i) => (
                  <div key={i} className="row">
                    <Input size="sm" style={{ width: 160 }} value={o.label} placeholder="Label" onChange={(e) => set("links", { ...f.links, other: f.links.other.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                    <div className="grow"><Input size="sm" value={o.url} placeholder="https://…" invalid={!!errors[`other${i}`]} onChange={(e) => set("links", { ...f.links, other: f.links.other.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} /></div>
                    <IconButton size="sm" label="Remove link" icon={<X size={13} />} onClick={() => set("links", { ...f.links, other: f.links.other.filter((_, j) => j !== i) })} />
                  </div>
                ))}
                <Button size="sm" variant="ghost" icon={<Plus size={13} />} style={{ alignSelf: "flex-start" }} onClick={() => set("links", { ...f.links, other: [...f.links.other, { label: "", url: "" }] })}>Add link</Button>
              </div>
            </div>
          </section>

          {!project && !sub && (
            <section>
              <div className="section-title">Sub-projects</div>
              <div className="col">
                {f.subprojects.map((n, i) => (
                  <div key={i} className="row">
                    <div className="grow"><Input size="sm" value={n} autoFocus={i === f.subprojects.length - 1} placeholder="Sub-project name" onChange={(e) => set("subprojects", f.subprojects.map((x, j) => (j === i ? e.target.value : x)))} /></div>
                    <IconButton size="sm" label="Remove sub-project" icon={<X size={13} />} onClick={() => set("subprojects", f.subprojects.filter((_, j) => j !== i))} />
                  </div>
                ))}
                <Button size="sm" variant="ghost" icon={<Plus size={13} />} style={{ alignSelf: "flex-start" }} onClick={() => set("subprojects", [...f.subprojects, ""])}>Add sub-project</Button>
              </div>
            </section>
          )}
        </div>
      )}
    </Dialog>
  );
}
