import { Dialog } from "@/components/arc";
import type { NewEntryDefaults } from "@/components/app/shell-context";

export default function EntryDialog({ onClose }: { id?: number; defaults?: NewEntryDefaults; onClose: () => void; onSaved?: () => void }) {
  return <Dialog open onClose={onClose} title="Log time" />;
}
