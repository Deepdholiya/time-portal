import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { useSession } from "@/lib/session";

/** Standard page frame: 44px header with title + actions, optional toolbar row, scrollable body. */
export function Page({ title, icon, actions, toolbar, children, padded, narrow }: { title: ReactNode; icon?: ReactNode; actions?: ReactNode; toolbar?: ReactNode; children: ReactNode; padded?: boolean; narrow?: boolean }) {
  return (
    <div className="page">
      <header className="page-header">
        <h1>{icon}{title}</h1>
        <div className="grow" />
        {actions}
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
