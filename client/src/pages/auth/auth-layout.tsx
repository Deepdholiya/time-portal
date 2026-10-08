import type { ReactNode } from "react";
import { AlertCircle, Check, Circle, Info } from "lucide-react";
import s from "./auth.module.css";

/** The product mark: an indigo rounded square with a clock hand, matching the favicon. */
export function ProductMark({ size = 36 }: { size?: number }) {
  return (
    <span className={s.mark} style={{ width: size, height: size, borderRadius: size / 4 }} aria-hidden>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
        <path d="M8 4.2V8l2.6 1.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/** Centered auth card on a plain background, Linear-style. */
export function AuthLayout({ title, subtitle, children, footer }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className={s.screen}>
      <div className={s.card}>
        <div className={s.head}>
          <ProductMark />
          <div className="col" style={{ gap: 6, alignItems: "center" }}>
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
