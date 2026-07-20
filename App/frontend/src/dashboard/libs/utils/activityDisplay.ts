import type { ActivityItemDto } from "../types/dashboard";

export type DashboardActivityType =
  | "commit"
  | "pr"
  | "merge"
  | "task_create"
  | "task_update"
  | "meeting"
  | "ai"
  | "deliverable"
  | "comment"
  | "file";

export function normalizeActivityType(type: string): DashboardActivityType {
  const normalized = type.toLowerCase();
  if (normalized.includes("commit")) return "commit";
  if (normalized.includes("pull") || normalized.includes("pr")) return "pr";
  if (normalized.includes("merge")) return "merge";
  if (normalized.includes("meeting")) return "meeting";
  if (normalized.includes("deliverable")) return "deliverable";
  if (normalized.includes("comment")) return "comment";
  if (normalized.includes("file")) return "file";
  if (normalized.includes("ai")) return "ai";
  if (normalized.includes("created") || normalized.includes("create")) return "task_create";
  return "task_update";
}

export function activityTypeLabel(type: string): string {
  const normalized = normalizeActivityType(type);
  const labels: Record<DashboardActivityType, string> = {
    commit: "커밋",
    pr: "PR",
    merge: "머지",
    task_create: "업무 생성",
    task_update: "업무 변경",
    meeting: "회의록",
    ai: "AI",
    deliverable: "산출물",
    comment: "댓글",
    file: "파일",
  };
  return labels[normalized];
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const created = new Date(iso).getTime();
  if (Number.isNaN(created)) return iso;
  const diffMs = Date.now() - created;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export function activityMessage(activity: ActivityItemDto): string {
  return activity.message?.trim() || activityTypeLabel(activity.type);
}
