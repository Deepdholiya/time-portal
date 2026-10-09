import { useSearchParams } from "react-router-dom";
import { CheckSquare } from "lucide-react";
import { Tabs } from "@/components/ui";
import { Page } from "@/components/app/page";
import { useSession } from "@/lib/session";
import { TimesheetApprovals } from "./timesheet-approvals";
import { LeaveApprovals } from "./leave-approvals";

export default function Approvals() {
  const { can } = useSession();
  const [params, setParams] = useSearchParams();
  const canTs = can("approveTimesheets", "yes");
  const canLeave = can("leaveApprove", "yes");
  const tab = params.get("tab") === "leave" && canLeave ? "leave" : canTs ? "timesheets" : "leave";
  return (
    <Page
      title="Approvals" icon={<CheckSquare size={15} />}
      toolbar={
        <Tabs variant="pill" value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })}
          items={[{ value: "timesheets", label: "Timesheets", hidden: !canTs }, { value: "leave", label: "Leave", hidden: !canLeave }]} />
      }
    >
      {tab === "leave" ? <LeaveApprovals /> : <TimesheetApprovals />}
    </Page>
  );
}
