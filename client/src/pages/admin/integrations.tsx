import { useEffect, useState } from "react";
import { Calendar, KeyRound, Mail, MessageSquare, Plug, Sparkles } from "lucide-react";
import { Page } from "@/components/app/page";
import { Badge, Button, ErrorState, Field, Input, SkeletonRows, Switch, toast } from "@/components/arc";
import { put } from "@/lib/api";
import { invalidate, useApi } from "@/lib/hooks";
import { useMe } from "@/lib/session";
import s from "./integrations.module.css";

type Integration = { kind: string; enabled: boolean; config: Record<string, string> };
const MASK = "••••••";
type FieldDef = { key: string; label: string; placeholder?: string; secret?: boolean };
const DEFS: Record<string, { title: string; desc: string; icon: React.ReactNode; fields: FieldDef[]; note?: string }> = {
  GOOGLE_SSO: {
    title: "Google sign-in", icon: <KeyRound size={16} />, desc: "Let people sign in with their Google Workspace account. Accounts must already exist and be active.",
    fields: [{ key: "clientId", label: "OAuth client ID", placeholder: "1234-abc.apps.googleusercontent.com" }, { key: "clientSecret", label: "Client secret", secret: true }],
    note: "Needs real OAuth credentials from Google Cloud Console. Redirect URI: {origin}/api/auth/sso/google/callback",
  },
  MICROSOFT_SSO: {
    title: "Microsoft sign-in", icon: <KeyRound size={16} />, desc: "Sign in with Microsoft Entra ID (Azure AD) work accounts.",
    fields: [{ key: "clientId", label: "Application (client) ID" }, { key: "clientSecret", label: "Client secret", secret: true }],
    note: "Needs a real app registration in Microsoft Entra. Redirect URI: {origin}/api/auth/sso/microsoft/callback",
  },
  SLACK: {
    title: "Slack", icon: <MessageSquare size={16} />, desc: "Post notifications such as overdue tasks and approvals to a Slack channel.",
    fields: [{ key: "webhookUrl", label: "Incoming webhook URL", placeholder: "https://hooks.slack.com/services/…" }, { key: "channel", label: "Channel", placeholder: "#delivery" }],
  },
  GOOGLE_CALENDAR: {
    title: "Google Calendar", icon: <Calendar size={16} />, desc: "Show calendar events next to time entries so people can log meetings quickly.",
    fields: [{ key: "clientId", label: "OAuth client ID" }, { key: "clientSecret", label: "Client secret", secret: true }],
  },
  SMTP: {
    title: "Email (SMTP)", icon: <Mail size={16} />, desc: "Outgoing mail server for invitations, password resets, reports and client emails.",
    fields: [{ key: "host", label: "Host", placeholder: "smtp.example.com" }, { key: "port", label: "Port", placeholder: "587" }, { key: "username", label: "Username" }, { key: "password", label: "Password", secret: true }, { key: "from", label: "From address", placeholder: "Time Portal <no-reply@company.com>" }],
    note: "Delivery currently uses the server's SMTP_URL environment variable; every email is also kept in the Email log.",
  },
};

export default function Integrations() {
  const { data, error, loading, reload } = useApi<Integration[]>("/settings/integrations");
  const company = useApi<{ mailConfigured: boolean; aiConfigured: boolean; settings: { aiEnabled: boolean } }>("/settings/company");
  return (
    <Page title="Integrations" icon={<Plug size={15} />}>
      {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <SkeletonRows /> : (
        <div className={s.wrap}>
          <p className="small muted">Connect sign-in providers and outside services for this company. Secrets are stored on the server and never sent back to the browser.</p>
          <div className={s.grid}>
            {(data ?? []).map((i) => <IntegrationCard key={i.kind} item={i} mailConfigured={company.data?.mailConfigured} />)}
            <AiCard configured={company.data?.aiConfigured} enabled={company.data?.settings.aiEnabled} />
          </div>
        </div>
      )}
    </Page>
  );
}

function IntegrationCard({ item, mailConfigured }: { item: Integration; mailConfigured?: boolean }) {
  const def = DEFS[item.kind] ?? { title: item.kind, desc: "", icon: <Plug size={16} />, fields: Object.keys(item.config).map((k) => ({ key: k, label: k })) };
  const [enabled, setEnabled] = useState(item.enabled);
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { setEnabled(item.enabled); setCfg({}); }, [item]);
  const dirty = enabled !== item.enabled || Object.keys(cfg).length > 0;

  const save = async () => {
    setBusy(true);
    try {
      // Unchanged secrets go back as the mask so the server keeps the stored value.
      const config: Record<string, string> = {};
      for (const f of def.fields) config[f.key] = f.key in cfg ? cfg[f.key] : item.config[f.key] ?? "";
      await put(`/settings/integrations/${item.kind}`, { enabled, config });
      toast.success(`${def.title} ${enabled ? "saved" : "turned off"}`);
      invalidate("/settings/integrations");
    } catch (e) { toast.error(e); setEnabled(item.enabled); } finally { setBusy(false); }
  };

  const status = item.kind === "SMTP" && mailConfigured ? <Badge tone="green" size="sm" dot>Server SMTP active</Badge>
    : item.enabled ? <Badge tone="green" size="sm" dot>On</Badge> : <Badge size="sm">Off</Badge>;

  return (
    <div className={s.card} data-kind={item.kind}>
      <div className="row">
        <span className={s.icon}>{def.icon}</span>
        <span className="medium grow">{def.title}</span>
        {status}
        <Switch checked={enabled} onChange={setEnabled} aria-label={`Enable ${def.title}`} />
      </div>
      <p className="small muted">{def.desc}</p>
      <div className="col gap-12">
        {def.fields.map((f) => {
          const saved = item.config[f.key];
          const isMasked = f.secret && saved === MASK;
          return (
            <Field key={f.key} label={f.label}>
              <Input
                size="sm" type={f.secret ? "password" : "text"} autoComplete="off"
                value={f.key in cfg ? cfg[f.key] : isMasked ? "" : saved ?? ""}
                placeholder={isMasked ? `${MASK} saved — type to replace` : f.placeholder}
                onChange={(e) => setCfg((c) => ({ ...c, [f.key]: e.target.value }))}
              />
            </Field>
          );
        })}
      </div>
      {def.note && <p className="tiny faint">{def.note.replace("{origin}", location.origin)}</p>}
      <div className="row end">
        {dirty && <Button size="sm" variant="ghost" onClick={() => { setCfg({}); setEnabled(item.enabled); }}>Discard</Button>}
        <Button size="sm" variant="primary" disabled={!dirty} loading={busy} onClick={save}>Save</Button>
      </div>
    </div>
  );
}

function AiCard({ configured, enabled }: { configured?: boolean; enabled?: boolean }) {
  const { refresh } = useMe();
  const [busy, setBusy] = useState(false);
  const toggle = async (v: boolean) => {
    setBusy(true);
    try {
      await put("/settings/company", { settings: { aiEnabled: v } });
      toast.success(v ? "AI assistant turned on" : "AI assistant turned off");
      invalidate("/settings/company");
      refresh();
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  return (
    <div className={s.card}>
      <div className="row">
        <span className={s.icon}><Sparkles size={16} /></span>
        <span className="medium grow">Claude AI</span>
        {configured ? <Badge tone="green" size="sm" dot>API key set</Badge> : <Badge tone="yellow" size="sm" dot>No API key</Badge>}
        <Switch checked={!!enabled} disabled={busy || enabled === undefined} onChange={toggle} aria-label="Enable AI assistant" />
      </div>
      <p className="small muted">Task summaries and client update email drafts. Drafts are always reviewed and sent by a person.</p>
      <p className="tiny faint">{configured ? "The server has an ANTHROPIC_API_KEY." : "Set ANTHROPIC_API_KEY on the server to use Claude; until then drafts use a built-in template."} Who can use it is set per role under Roles &amp; permissions.</p>
    </div>
  );
}
