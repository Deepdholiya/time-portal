import type { ReactNode } from "react";
import { AlertCircle, Check, Circle, Info } from "lucide-react";
import s from "./auth.module.css";

/** The Orbit0 mark (an orange square with a planet and a dashed orbit), the same logo as the home page and favicon. */
export function ProductMark({ size = 36 }: { size?: number }) {
  return (
    <span className={s.mark} style={{ width: size, height: size, borderRadius: size / 4 }} aria-hidden>
      <svg width={size * 0.75} height={size * 0.75} viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="3.4" fill="#fff" />
        <circle cx="10" cy="10" r="6.6" stroke="#fff" strokeWidth="1.5" strokeDasharray="2.2 2.4" />
      </svg>
    </span>
  );
}

/** Centered form on a plain white page with the wordmark at the top, ElevenLabs-style. */
export function AuthLayout({ title, subtitle, children, footer }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className={s.screen}>
      <a href="/home/" className={s.brand} aria-label="Orbit0 home"><ProductMark size={26} /><span>orbit0</span></a>
      <div className={s.card}>
        <div className={s.head}>
          <div className="col" style={{ gap: 8, alignItems: "center" }}>
            <h1 className={s.title}>{title}</h1>
            {subtitle && <p className={s.subtitle}>{subtitle}</p>}
          </div>
        </div>
        <div className={s.panel}>{children}</div>
        {footer && <div className={s.foot}>{footer}</div>}
      </div>
    </div>
  );
}

export function AuthError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <div role="alert" className={s.error}><AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} /><span>{children}</span></div>;
}

export function AuthNotice({ children }: { children: ReactNode }) {
  return <div role="status" className={s.notice}><Info size={14} style={{ flexShrink: 0, marginTop: 1 }} /><span>{children}</span></div>;
}

/** Password rules mirrored from the server (min 8 chars) plus a match check for the confirm field. */
export function passwordChecks(pw: string, confirm: string) {
  return [
    { label: "At least 8 characters", ok: pw.length >= 8 },
    { label: "Contains a letter and a number", ok: /[a-z]/i.test(pw) && /\d/.test(pw) },
    { label: "Both passwords match", ok: !!pw && pw === confirm },
  ];
}

export function PasswordRules({ password, confirm }: { password: string; confirm: string }) {
  return (
    <ul className={s.rules} aria-label="Password requirements">
      {passwordChecks(password, confirm).map((r) => (
        <li key={r.label} className={r.ok ? s.ok : undefined}>
          {r.ok ? <Check size={12} strokeWidth={2.4} /> : <Circle size={10} strokeWidth={2} />}
          {r.label}
        </li>
      ))}
    </ul>
  );
}

/** Only allow same-origin relative redirects from ?next=. */
export function safeNext(raw: string | null) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export { s as authStyles };
