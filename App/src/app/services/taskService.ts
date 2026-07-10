import { CATEGORIES, TASKS } from "../data/tasks";
import type { CategoryDef, Task, TaskStatus } from "../models/task";

export function getCat(id: string): CategoryDef {
  return CATEGORIES.find(c => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}

export function getTasksByStatus(status: TaskStatus, tasks: Task[] = TASKS): Task[] {
  return tasks.filter(t => t.status === status);
}

export function getDoneCount(tasks: Task[] = TASKS): number {
  return tasks.filter(t => t.status === "done").length;
}

export function getProgressPercent(tasks: Task[] = TASKS): number {
  return Math.round((getDoneCount(tasks) / tasks.length) * 100);
}

export function getBlockedCount(tasks: Task[] = TASKS): number {
  return tasks.filter(t => t.status === "blocked").length;
}

export function getInProgressCount(tasks: Task[] = TASKS): number {
  return tasks.filter(t => t.status === "inprogress").length;
}
