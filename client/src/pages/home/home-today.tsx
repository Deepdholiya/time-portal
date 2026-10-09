import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui";
import { useShell } from "@/components/app/shell-context";
import { useCompanyDay } from "@/components/app/time-range";
import { useApi } from "@/lib/hooks";
import { hm } from "@/lib/format";
import type { TimeEntry } from "@/lib/types";
import s from "./home.module.css";

/** Today's logged time with a shortcut to log more. */
export function HomeToday() {
  const shell = useShell();
  const { today } = useCompanyDay();
  const q = useApi<TimeEntry[]>("/time", { from: today, to: today });
  const total = (q.data ?? []).reduce((a, e) => a + e.minutes, 0);
  return (
    <div className={s.panel}>
      <div className={s.panelHead}><span>Logged today</span><span className="grow" /><Link className="link small" to={`/time?from=${today}&to=${today}`}>Open tracker</Link></div>
      <div className={s.timer}>
        <span className={s.timerClock}>{hm(total)}</span>
        <span className="small muted">{q.data ? `${q.data.length} ${q.data.length === 1 ? "entry" : "entries"}` : " "}</span>
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => shell.logTime({ date: today }, q.reload)}>Log time</Button>
      </div>
    </div>
  );
}
