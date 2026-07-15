import { KanbanColumn } from "./KanbanColumn";
import { BOARD_COLS } from "../libs/mock/tasks";
import type { Task, TaskStatus } from "../libs/types/task";

interface KanbanBoardProps {
  tasks: Task[];
  compact?: boolean;
  selectedId: string | null;
  onSelectTask: (id: string) => void;
  onAddTask: (status: TaskStatus) => void;
  onDropTask: (taskId: string, status: TaskStatus) => void;
  onReorderTask: (draggedId: string, targetId: string, position: "before" | "after") => void;
}

export function KanbanBoard({ tasks, compact, selectedId, onSelectTask, onAddTask, onDropTask, onReorderTask }: KanbanBoardProps) {
  return (
    <div className={`grid grid-cols-4 h-full min-w-0 ${compact ? "gap-2 p-3" : "gap-4 p-5"}`}>
      {BOARD_COLS.map((col) => (
        <KanbanColumn
          key={col.id}
          col={col}
          tasks={tasks.filter((t) => t.status === col.id)}
          compact={compact}
          selectedId={selectedId}
          onSelectTask={onSelectTask}
          onAddTask={onAddTask}
          onDropTask={onDropTask}
          onReorderTask={onReorderTask}
        />
      ))}
    </div>
  );
}
