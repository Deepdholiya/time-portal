import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { useSession } from "@/lib/session";

/**
 * Layout rules every page follows: the title on the left with any view tabs right after it, the primary action (orange) at the
 * far right with secondary actions just before it; underneath, the toolbar with mode, period, search and Filter on the left and
 * view options or Export at the far right.
 */
export function Page({ title, icon, tabs, actions, toolbar, children, padded, narrow }: { title: ReactNode; icon?: ReactNode; tabs?: ReactNode; actions?: ReactNode; toolbar?: ReactNode; children: ReactNode; padded?: boolean; narrow?: boolean }) {
  return (
    <div className="page">
      <header className="page-header">
        <h1>{icon}{title}</h1>
        {tabs && <div className="page-tabs">{tabs}</div>}
        <div className="grow" />
        {actions && <div className="page-actions">{actions}</div>}
      </header>
      {toolbar && <div className="page-toolbar">{toolbar}</div>}
      <div className="page-body">
        {padded ? <div className={`page-pad ${narrow ? "narrow" : ""}`}>{children}</div> : children}
      </div>
    </div>
  );
}

export function Forbidden({ what = "this page" }: { what?: string }) {
  return <EmptyState icon={<ShieldAlert size={28} />} title="You don't have access" description={`Your role doesn't include ${what}. Ask an admin if you need it.`} />;
}

/** Renders children only when the user has the permission; otherwise a friendly "no access" state. */
export function Guard({ perm, any, children }: { perm?: [string, string?]; any?: [string, string?][]; children: ReactNode }) {
  const { can } = useSession();
  const ok = (!perm || can(perm[0], perm[1])) && (!any || any.some(([f, l]) => can(f, l)));
  return ok ? <>{children}</> : <Forbidden />;
}
