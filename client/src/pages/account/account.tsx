import { Page } from "@/components/app/page";

export default function Account({ mfaSetupRequired }: { mfaSetupRequired?: boolean }) {
  return <Page title="Account" padded><p className="muted">{mfaSetupRequired ? "Set up MFA." : "Coming soon."}</p></Page>;
}
