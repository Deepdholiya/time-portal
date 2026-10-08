import type { ReactNode } from "react";
import s from "./account.module.css";

export function Block({ title, desc, children, actions }: { title: string; desc?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className={s.block}>
      <div className={s.blockHead}>
        <div>
          <h2 className={s.h2}>{title}</h2>
          {desc && <p className="small muted">{desc}</p>}
        </div>
        {actions}
      </div>
      <div className={s.blockBody}>{children}</div>
    </section>
  );
}
