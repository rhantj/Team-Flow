export interface ActivityEntry {
  id: string;
  actorName: string;
  message: string;
  createdAt: string;
  type: "comment" | "status" | "task-created" | "task-updated" | "task-deleted" | "meeting-registered";
  /** 특정 업무에 대한 활동이면 그 업무 id. 여러 업무를 한 번에 등록하는 것처럼 특정 업무 하나로 못 좁히면 비워둔다. */
  taskId?: string;
}

const ACTIVITY_STORAGE_KEY = "workflow-ai.activity";
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

export const getStoredActivity = () => readStoredArray<ActivityEntry>(ACTIVITY_STORAGE_KEY);
export const saveStoredActivity = (entries: ActivityEntry[]) => writeStoredArray(ACTIVITY_STORAGE_KEY, ACTIVITY_UPDATED_EVENT, entries);

export const addActivity = (message: string, actorName: string, type: ActivityEntry["type"], taskId?: string): void => {
  const entry: ActivityEntry = { id: `ACT-${Date.now()}`, actorName, message, type, taskId, createdAt: new Date().toISOString() };
  saveStoredActivity([entry, ...getStoredActivity()].slice(0, 50));
};
