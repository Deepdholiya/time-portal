import { ListTodo, Plus } from "lucide-react";
import { Button } from "@/components/arc";
import { useShell } from "@/components/app/shell-context";
import { useMe } from "@/lib/session";
import { TaskView } from "./task-view";

/** All tasks the user can see. /tasks/:id deep links are opened by the app shell on top of this list. */
export default function Tasks() {
  const shell = useShell();
  const { can } = useMe();
  return (
    <div className="page">
      <header className="page-header">
        <h1><ListTodo size={15} className="faint" />Tasks</h1>
        <div className="grow" />
        {can("tasks", "create") && <Button size="sm" variant="primary" icon={<Plus size={14} />} shortcut="C" onClick={() => shell.newTask()}>New task</Button>}
      </header>
      <TaskView storageKey="tasks" />
    </div>
  );
}
