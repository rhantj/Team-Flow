import type { Priority, TaskStatus } from "../../../board/libs/types/task";
import type { DashboardTaskDto } from "../types/dashboard";
import { resolveMemberDisplay } from "./memberDisplay";

const VALID_STATUSES: TaskStatus[] = ["todo", "inprogress", "done", "blocked"];
const VALID_PRIORITIES: Priority[] = ["low", "medium", "high"];

export function normalizeTaskStatus(status: string): TaskStatus {
  const normalized = status.toLowerCase() as TaskStatus;
  return VALID_STATUSES.includes(normalized) ? normalized : "todo";
}

export function normalizePriority(priority: string | null | undefined): Priority {
  const normalized = (priority ?? "").toLowerCase() as Priority;
  return VALID_PRIORITIES.includes(normalized) ? normalized : "medium";
}

export function formatDashboardDueDate(dueDate: string | null | undefined): string {
  if (!dueDate) return "미정";
  const [, month, day] = dueDate.split("-");
  return month && day ? `${month}.${day}` : dueDate;
}

export function daysUntilDue(dueDate: string | null | undefined): number | null {
  if (!dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  return Math.ceil((due.getTime() - today.getTime()) / 86400000);
}

export function sourceLabel(sourceType: string | null | undefined): string {
  if (!sourceType) return "직접 생성";
  const normalized = sourceType.toUpperCase();
  if (normalized.includes("MEETING")) return "미구현된 기능입니다.";
  if (normalized.includes("GITHUB")) return "GitHub";
  if (normalized.includes("AI")) return "AI";
  if (normalized.includes("MANUAL")) return "직접 생성";
  return sourceType;
}

export function taskAssignee(task: DashboardTaskDto, index: number) {
  return resolveMemberDisplay(task.assigneeName, index, task.assigneeId);
}

export function isOpenTask(task: DashboardTaskDto): boolean {
  return normalizeTaskStatus(task.status) !== "done";
}

export function taskSearchText(task: DashboardTaskDto): string {
  return [
    task.id,
    task.title,
    task.category ?? "",
    task.assigneeName ?? "",
    task.description ?? "",
    sourceLabel(task.sourceType),
  ].join(" ").toLowerCase();
}
