import {
  CheckCircle2,
  ListPlus,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import type { ActivityItemDto } from "../types/dashboard";

/**
 * 실제로 backend_spring이 activities.type에 기록하는 값 (SCREAMING_SNAKE_CASE).
 * TaskController/ChecklistController가 유일한 기록 주체 — ml_delay_risk/db.py의
 * TASK_ACTIVITY_TYPES와 동일한 집합을 유지해야 한다.
 */
export type DashboardActivityType =
  | "TASK_CREATED"
  | "STATUS_CHANGED"
  | "ASSIGNEE_CHANGED"
  | "TASK_UPDATED"
  | "TASK_DELETED"
  | "CHECKLIST_CREATED"
  | "CHECKLIST_COMPLETED";

const KNOWN_ACTIVITY_TYPES = new Set<DashboardActivityType>([
  "TASK_CREATED",
  "STATUS_CHANGED",
  "ASSIGNEE_CHANGED",
  "TASK_UPDATED",
  "TASK_DELETED",
  "CHECKLIST_CREATED",
  "CHECKLIST_COMPLETED",
]);

export function normalizeActivityType(type: string): DashboardActivityType {
  const upper = type.toUpperCase();
  return KNOWN_ACTIVITY_TYPES.has(upper as DashboardActivityType) ? (upper as DashboardActivityType) : "TASK_UPDATED";
}

export function activityTypeLabel(type: string): string {
  const normalized = normalizeActivityType(type);
  const labels: Record<DashboardActivityType, string> = {
    TASK_CREATED: "업무 생성",
    STATUS_CHANGED: "업무 상태 변경",
    ASSIGNEE_CHANGED: "담당자 변경",
    TASK_UPDATED: "업무 수정",
    TASK_DELETED: "업무 삭제",
    CHECKLIST_CREATED: "체크리스트 생성",
    CHECKLIST_COMPLETED: "체크리스트 완료",
  };
  return labels[normalized];
}

/** activities.type 분류별 아이콘/색상 — ActivityPage(타임라인)와 DashboardView(요약 위젯)가 함께 쓴다. */
export const ACTIVITY_ICONS: Record<DashboardActivityType, { icon: LucideIcon; color: string; bg: string }> = {
  TASK_CREATED: { icon: Plus, color: "#7048E8", bg: "rgba(112,72,232,0.1)" },
  STATUS_CHANGED: { icon: RefreshCw, color: "#3B5BDB", bg: "#EEF1FB" },
  ASSIGNEE_CHANGED: { icon: UserCog, color: "#0EA5E9", bg: "#ECFEFF" },
  TASK_UPDATED: { icon: Pencil, color: "#F59E0B", bg: "#FFFBEB" },
  TASK_DELETED: { icon: Trash2, color: "#EF4444", bg: "#FEF2F2" },
  CHECKLIST_CREATED: { icon: ListPlus, color: "#10B981", bg: "#ECFDF5" },
  CHECKLIST_COMPLETED: { icon: CheckCircle2, color: "#059669", bg: "#ECFDF5" },
};

export function activityIconMeta(type: string) {
  return ACTIVITY_ICONS[normalizeActivityType(type)];
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
