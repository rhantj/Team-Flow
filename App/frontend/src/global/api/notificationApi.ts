import { apiFetch } from "./apiClient";

export interface NotificationResponse {
  id: string;
  type: string;
  title: string;
  content: string | null;
  targetType: string | null;
  targetId: string | null;
  read: boolean;
  createdAt: string;
}

export function fetchNotifications(): Promise<NotificationResponse[]> {
  return apiFetch<NotificationResponse[]>("/notifications");
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const { count } = await apiFetch<{ count: number }>("/notifications/unread-count");
  return count;
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiFetch<null>("/notifications/read-all", { method: "PATCH" });
}
