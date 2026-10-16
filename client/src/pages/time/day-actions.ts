import { toast } from "@/components/ui";
import { post } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { afterTimeChange } from "./time-utils";

const list = (dates: string[]) => (dates.length === 1 ? fmtDate(dates[0]) : `${dates.length} days`);

/** Submits days by hand. Days with problems stay open and the problems are shown. */
export async function submitDays(dates: string[]) {
  try {
    const r = await post<{ submitted: string[]; failed: { date: string; problems: string[] }[] }>("/timesheets/days/submit", { dates });
    if (r.submitted.length) toast.success(`Submitted ${list(r.submitted)}`, { description: "Your manager can review it now." });
    for (const f of r.failed) toast.error(`${fmtDate(f.date)} wasn't submitted`, { description: f.problems.join(". ") });
    afterTimeChange();
    return r;
  } catch (e) { toast.error(e); }
}

/** Pulls a submitted day back so it can be corrected; it has to be submitted again afterwards. */
export async function reopenDay(date: string) {
  try {
    await post("/timesheets/days/reopen", { date });
    toast.success(`${fmtDate(date)} reopened for corrections`, { description: "Submit it again when you're done." });
    afterTimeChange();
  } catch (e) { toast.error(e); }
}
