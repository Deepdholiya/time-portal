import { CheckSquare } from "lucide-react";
import { Page } from "@/components/app/page";
import { LeaveApprovals } from "./leave-approvals";

/** Leave requests waiting for a decision. Time needs no approval: it's submitted automatically every day. */
export default function Approvals() {
  return (
    <Page title="Leave approvals" icon={<CheckSquare size={15} />}>
      <LeaveApprovals />
    </Page>
  );
}
