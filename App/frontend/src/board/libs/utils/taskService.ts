import { CATEGORIES, TASKS } from "../mock/tasks";
import type { CategoryDef, ChecklistItem, Task, TaskStatus } from "../types/task";

export function getCat(id: string): CategoryDef {
  return CATEGORIES.find(c => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}

const DEFAULT_CHECKLIST_LABELS = ["설계 문서 확인", "구현 완료", "코드 리뷰 완료", "QA 통과"];

export function buildDefaultChecklist(taskId: string, status: TaskStatus): ChecklistItem[] {
  return DEFAULT_CHECKLIST_LABELS.map((label, i) => ({
    id: `${taskId}-CHK-${i}`,
    label,
    done: status === "done" && i < 3,
  }));
}

export function getTasksByStatus(status: TaskStatus, tasks: Task[] = TASKS): Task[] {
  return tasks.filter(t => t.status === status);
}

export function getDoneCount(tasks: Task[] = TASKS): number {
  return tasks.filter(t => t.status === "done").length;
}

export function getProgressPercent(tasks: Task[] = TASKS): number {
  if (tasks.length === 0) return 0;
  return Math.round((getDoneCount(tasks) / tasks.length) * 100);
}

export function getBlockedCount(tasks: Task[] = TASKS): number {
  return tasks.filter(t => t.status === "blocked").length;
}

export function getInProgressCount(tasks: Task[] = TASKS): number {
  return tasks.filter(t => t.status === "inprogress").length;
}
