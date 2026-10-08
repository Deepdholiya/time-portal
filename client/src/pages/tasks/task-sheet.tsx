import { Sheet } from "@/components/arc";

export default function TaskSheet({ id, onClose }: { id: number; onClose: () => void; onOpenTask: (id: number) => void }) {
  return <Sheet open onClose={onClose} title={`Task ${id}`}><div /></Sheet>;
}
