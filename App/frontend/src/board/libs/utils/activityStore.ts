import { useEffect, useState } from "react";

export interface Comment {
  id: string;
  taskId: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  recipientId: string;
  message: string;
  taskId?: string;
  createdAt: string;
  read: boolean;
}

export interface ActivityEntry {
  id: string;
  actorName: string;
  message: string;
  createdAt: string;
  type: "comment" | "status" | "task-created" | "task-deleted" | "meeting-registered";
}

const COMMENT_STORAGE_KEY = "workflow-ai.comments";
const NOTIFICATION_STORAGE_KEY = "workflow-ai.notifications";
const ACTIVITY_STORAGE_KEY = "workflow-ai.activity";
const COMMENTS_UPDATED_EVENT = "workflow-ai:comments-updated";
const NOTIFICATIONS_UPDATED_EVENT = "workflow-ai:notifications-updated";
const ACTIVITY_UPDATED_EVENT = "workflow-ai:activity-updated";

function readStoredArray<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredArray<T>(key: string, eventName: string, value: T[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(eventName));
}

export const getStoredComments = () => readStoredArray<Comment>(COMMENT_STORAGE_KEY);
export const saveStoredComments = (comments: Comment[]) => writeStoredArray(COMMENT_STORAGE_KEY, COMMENTS_UPDATED_EVENT, comments);

export const getStoredNotifications = () => readStoredArray<AppNotification>(NOTIFICATION_STORAGE_KEY);
export const saveStoredNotifications = (notifications: AppNotification[]) =>
  writeStoredArray(NOTIFICATION_STORAGE_KEY, NOTIFICATIONS_UPDATED_EVENT, notifications);

export const getStoredActivity = () => readStoredArray<ActivityEntry>(ACTIVITY_STORAGE_KEY);
export const saveStoredActivity = (entries: ActivityEntry[]) => writeStoredArray(ACTIVITY_STORAGE_KEY, ACTIVITY_UPDATED_EVENT, entries);

export const addActivity = (message: string, actorName: string, type: ActivityEntry["type"]): void => {
  const entry: ActivityEntry = { id: `ACT-${Date.now()}`, actorName, message, type, createdAt: new Date().toISOString() };
  saveStoredActivity([entry, ...getStoredActivity()].slice(0, 50));
};

export const addNotification = (recipientId: string, message: string, taskId?: string): void => {
  const notification: AppNotification = {
    id: `NOTI-${Date.now()}`, recipientId, message, taskId, createdAt: new Date().toISOString(), read: false,
  };
  saveStoredNotifications([notification, ...getStoredNotifications()].slice(0, 50));
};

export const addComment = (taskId: string, authorId: string, authorName: string, text: string): Comment => {
  const comment: Comment = { id: `CMT-${Date.now()}`, taskId, authorId, authorName, text, createdAt: new Date().toISOString() };
  saveStoredComments([comment, ...getStoredComments()]);
  return comment;
};

export const markNotificationsRead = (): void => {
  saveStoredNotifications(getStoredNotifications().map(n => ({ ...n, read: true })));
};

function useStoredArray<T>(getter: () => T[], eventName: string): T[] {
  const [value, setValue] = useState<T[]>(getter);
  useEffect(() => {
    const sync = () => setValue(getter());
    window.addEventListener(eventName, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(eventName, sync);
      window.removeEventListener("storage", sync);
    };
  }, [getter, eventName]);
  return value;
}

export const useStoredComments = () => useStoredArray(getStoredComments, COMMENTS_UPDATED_EVENT);
export const useStoredNotifications = () => useStoredArray(getStoredNotifications, NOTIFICATIONS_UPDATED_EVENT);
export const useStoredActivity = () => useStoredArray(getStoredActivity, ACTIVITY_UPDATED_EVENT);
