import { Dialog } from "@/components/arc";
import type { NewTaskDefaults } from "@/components/app/shell-context";

export default function NewTaskDialog({ onClose }: { defaults?: NewTaskDefaults; onClose: () => void; onCreated?: (t: { id: number }) => void }) {
  return <Dialog open onClose={onClose} title="New task" />;
}
