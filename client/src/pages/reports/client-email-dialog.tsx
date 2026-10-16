import { useEffect, useState } from "react";
import { RefreshCw, Send, Sparkles, FileText } from "lucide-react";
import { Badge, Button, Checkbox, ConfirmDialog, Dialog, Field, Input, Select, Skeleton, Textarea, toast } from "@/components/arc";
import { post } from "@/lib/api";
import { useSession } from "@/lib/session";

interface Draft { to: string; subject: string; body: string; link: string | null; source: "claude" | "template"; aiGenerated: boolean }

/**
 * AI client update email (4.9 / AT-09): draft from permitted project facts, let the manager edit
 * recipient, subject and body, then send only after an explicit confirmation. Nothing is sent automatically.
 */
export default function ClientEmailDialog({ open, onClose, projectId, projectName, onSent }: {
  open: boolean; onClose: () => void; projectId: number | null; projectName?: string; onSent?: () => void;
}) {
  const { can } = useSession();
  const [kind, setKind] = useState<"update" | "completion">("update");
  const [tone, setTone] = useState<"friendly" | "formal" | "brief">("friendly");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [includeLink, setIncludeLink] = useState(true);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);

  const generate = async (k = kind, t = tone) => {
    if (!projectId) return;
    setDrafting(true);
    setError(null);
    try {
      const d = await post<Draft>("/ai/client-email/draft", { projectId, kind: k, tone: t });
      setDraft(d);
      setTo((cur) => cur || d.to);
      setSubject(d.subject);
      setBody(d.body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't draft the email");
    } finally {
      setDrafting(false);
    }
  };

  useEffect(() => {
    if (open && projectId) { setDraft(null); setTo(""); setSubject(""); setBody(""); setIncludeLink(true); generate(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  const send = async () => {
    if (!projectId) return;
    setSending(true);
    try {
      await post("/ai/client-email/send", { projectId, to: to.trim(), subject, body, includeLink, aiGenerated: true, confirm: true });
      toast.success("Email sent", { description: `Sent to ${to.trim()} and logged.` });
      setConfirm(false);
      onSent?.();
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setSending(false);
    }
  };

  if (!can("clientEmail", "yes")) return null;
  const validTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());
  const ready = !!draft && validTo && subject.trim() && body.trim();

  return (
    <>
      <Dialog
        open={open} onClose={onClose} size="lg"
        title={<span className="row">Client update{projectName ? <span className="faint">· {projectName}</span> : null}</span>}
        description="Review and edit before sending. Only client-facing facts are used: no hours, rates, budgets or names of employees."
        footer={
          <>
            {draft && (draft.source === "claude"
              ? <Badge tone="purple" icon={<Sparkles size={12} />}>AI drafted · review before sending</Badge>
              : <Badge tone="gray" icon={<FileText size={12} />}>Template draft (AI not configured)</Badge>)}
            <div className="grow" />
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" icon={<Send size={14} />} disabled={!ready || drafting} onClick={() => setConfirm(true)}>Send…</Button>
          </>
        }
      >
        <div className="col gap-12">
          <div className="row gap-12">
            <Field label="Email type" className="grow">
              <Select size="sm" value={kind} onChange={(v) => { setKind(v as typeof kind); generate(v as typeof kind, tone); }}
                options={[{ value: "update", label: "Progress update" }, { value: "completion", label: "Completion" }]} />
            </Field>
            <Field label="Tone" className="grow">
              <Select size="sm" value={tone} onChange={(v) => { setTone(v as typeof tone); generate(kind, v as typeof tone); }}
                options={[{ value: "friendly", label: "Friendly" }, { value: "formal", label: "Formal" }, { value: "brief", label: "Brief" }]} />
            </Field>
            <div style={{ alignSelf: "flex-end" }}>
              <Button size="sm" variant="secondary" icon={<RefreshCw size={13} />} loading={drafting} onClick={() => generate()}>Regenerate</Button>
            </div>
          </div>
          {error && <div className="field-error">{error}</div>}
          <Field label="To" error={to && !validTo ? "Enter a valid email address" : undefined}>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@company.com" type="email" aria-label="To" />
          </Field>
          <Field label="Subject">
            {drafting && !draft ? <Skeleton height={32} /> : <Input value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" />}
          </Field>
          <Field label="Message">
            {drafting && !draft ? <Skeleton height={240} /> : <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={13} aria-label="Message" style={{ fontSize: 13, lineHeight: 1.5 }} />}
          </Field>
          <Checkbox checked={includeLink} onChange={setIncludeLink}
            label={<span>Include the client status link <span className="faint">{draft?.link ? draft.link : "(a read-only link is created on send)"}</span></span>} />
        </div>
      </Dialog>
      <ConfirmDialog
        open={confirm} onClose={() => setConfirm(false)} onConfirm={send} loading={sending} confirmLabel="Send email"
        title="Send this email to the client?"
        description={`It will be sent to ${to.trim()} from your account and logged in the audit trail.${draft?.source === "claude" ? " The message was drafted by AI and edited by you." : ""}`}
      />
    </>
  );
}
