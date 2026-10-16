import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckSquare } from "lucide-react";
import { SegmentedControl, Tabs } from "@/components/ui";
import { Page } from "@/components/app/page";
import { useSession } from "@/lib/session";
import { LeaveApprovals, STATUS_OPTIONS, type ApprovalStatus } from "./leave-approvals";
import { ReimbursementApprovals } from "./reimbursement-approvals";

type Tab = "leave" | "reimbursements";

/** Leave and reimbursement requests waiting for a decision. Time needs no approval: it's submitted automatically every day. */
export default function Approvals() {
  const { can } = useSession();
  const leave = can("leaveApprove", "yes");
  const expenses = can("expenseApprove", "yes");
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<ApprovalStatus>("PENDING");
  const asked = params.get("tab") as Tab | null;
  const tab: Tab = asked === "reimbursements" && expenses ? "reimbursements" : asked === "leave" && leave ? "leave" : leave ? "leave" : "reimbursements";
  const setTab = (t: string) => setParams((p) => { p.set("tab", t); return p; }, { replace: true });

  return (
    <Page
      title="Approvals" icon={<CheckSquare size={15} />}
      tabs={<Tabs value={tab} onChange={setTab} items={[{ value: "leave", label: "Leave", hidden: !leave }, { value: "reimbursements", label: "Reimbursements", hidden: !expenses }]} />}
      toolbar={<SegmentedControl aria-label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />}
    >
      {tab === "leave" ? <LeaveApprovals status={status} /> : <ReimbursementApprovals status={status} />}
    </Page>
  );
}
