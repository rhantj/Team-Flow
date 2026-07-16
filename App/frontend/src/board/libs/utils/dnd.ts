import type { TaskStatus } from "../types/task";

export const TASK_DRAG_TYPE = "task-card";

export interface TaskDragItem {
  id: string;
  status: TaskStatus;
}
