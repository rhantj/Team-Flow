import { useDrop } from "react-dnd";
import { Plus } from "lucide-react";
import { TaskCard } from "./TaskCard";
import { TASK_DRAG_TYPE, type TaskDragItem } from "../libs/utils/dnd";
import type { MemberResponse } from "../../global/api/projectsApi";
import type { Task, TaskStatus } from "../libs/types/task";

export interface BoardColumnDef {
  id: TaskStatus;
  label: string;
  color: string;
  bg: string;
}

interface KanbanColumnProps {
  col: BoardColumnDef;
  tasks: Task[];
  projectMembers: MemberResponse[];
  compact?: boolean;
  selectedId: string | null;
  onSelectTask: (id: string) => void;
  onAddTask: (status: TaskStatus) => void;
  onDropTask: (taskId: string, status: TaskStatus) => void;
  onReorderTask: (draggedId: string, targetId: string, position: "before" | "after") => void;
}

export function KanbanColumn({ col, tasks, projectMembers, compact, selectedId, onSelectTask, onAddTask, onDropTask, onReorderTask }: KanbanColumnProps) {
  const [{ isOver, isEmptyAreaOver, canDrop }, dropRef] = useDrop(
    () => ({
      accept: TASK_DRAG_TYPE,
      drop: (item: TaskDragItem, monitor) => {
        if (monitor.didDrop()) return;
        if (item.status !== col.id) onDropTask(item.id, col.id);
      },
      collect: (monitor) => ({
        isOver: monitor.isOver(),
        isEmptyAreaOver: monitor.isOver({ shallow: true }),
        canDrop: monitor.canDrop(),
      }),
    }),
    [col.id, onDropTask]
  );

  const isDropTarget = isOver && canDrop;
  const showEmptyAreaIndicator = isEmptyAreaOver && canDrop;

  return (
    <div
      ref={dropRef}
      className={`h-full min-w-0 min-h-0 flex flex-col rounded-xl transition-shadow ${isDropTarget ? "ring-2 ring-blue-400" : ""}`}
      style={{ background: col.bg }}
    >
      <div className={`flex items-center justify-between shrink-0 ${compact ? "px-2.5 py-2" : "px-4 py-3"}`}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: col.color }} />
          <span className={`font-semibold truncate ${compact ? "text-xs" : "text-sm"}`} style={{ color: col.color }}>
            {col.label}
          </span>
          <span className="text-[10px] font-mono bg-white rounded-full px-1.5 py-0.5 border border-border text-muted-foreground shrink-0">
            {tasks.length}
          </span>
        </div>
        <button onClick={() => onAddTask(col.id)} className="hover:bg-white/60 rounded-md p-1 transition-colors shrink-0">
          <Plus className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>

      <div className={`flex-1 overflow-y-auto min-h-0 space-y-2 scrollbar-thin ${compact ? "px-2 pb-2" : "px-3 pb-3"}`}>
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            catId={task.category}
            projectMembers={projectMembers}
            compact={compact}
            selected={selectedId === task.id}
            onSelect={() => onSelectTask(task.id)}
            onReorder={onReorderTask}
          />
        ))}

        {showEmptyAreaIndicator && (
          <div className="border-2 border-dashed border-blue-400 rounded-xl h-12 flex items-center justify-center text-[10px] text-blue-500 font-medium">
            여기에 놓기
          </div>
        )}

        <button
          onClick={() => onAddTask(col.id)}
          className={`w-full text-muted-foreground border border-dashed border-border rounded-xl hover:bg-white/60 hover:border-slate-300 transition-all flex items-center justify-center gap-1 font-medium ${
            compact ? "py-1.5 text-[10px]" : "py-2 text-[11px]"
          }`}
        >
          <Plus className="w-3 h-3" />업무 추가
        </button>
      </div>
    </div>
  );
}
