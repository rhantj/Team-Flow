import type { Task } from "../types/task";
import type { Meeting, SavedMeetingRecord } from "../../../meetings/libs/types/meeting";
import { TASKS } from "../mock/tasks";
import { MEETINGS } from "../../../meetings/libs/mock/meetings";

export const TASK_STORAGE_KEY = "workflow-ai.tasks";
export const MEETING_STORAGE_KEY = "workflow-ai.meetings";
export const TASKS_UPDATED_EVENT = "workflow-ai:tasks-updated";
export const MEETINGS_UPDATED_EVENT = "workflow-ai:meetings-updated";
export const SAVED_MEETING_STORAGE_KEY = "workflow-ai.saved-meetings";
export const SAVED_MEETINGS_UPDATED_EVENT = "workflow-ai:saved-meetings-updated";

function scopedKey(baseKey: string, projectId?: string | number): string {
  return projectId == null || String(projectId).trim() === "" ? baseKey : `${baseKey}.${projectId}`;
}

function readStoredArray<T>(key: string, fallback: T[]): T[] {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredArray<T>(key: string, eventName: string, value: T[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(eventName));
}

export const getStoredTasks = () => readStoredArray<Task>(TASK_STORAGE_KEY, TASKS);
export const getStoredMeetings = (projectId?: string | number) =>
  readStoredArray<Meeting>(scopedKey(MEETING_STORAGE_KEY, projectId), projectId == null ? MEETINGS : []);
export const saveStoredTasks = (tasks: Task[]) => writeStoredArray(TASK_STORAGE_KEY, TASKS_UPDATED_EVENT, tasks);
export const saveStoredMeetings = (meetings: Meeting[], projectId?: string | number) =>
  writeStoredArray(scopedKey(MEETING_STORAGE_KEY, projectId), MEETINGS_UPDATED_EVENT, meetings);

export const getSavedMeetings = (projectId?: string | number) =>
  readStoredArray<SavedMeetingRecord>(scopedKey(SAVED_MEETING_STORAGE_KEY, projectId), []);
export const saveSavedMeetings = (records: SavedMeetingRecord[], projectId?: string | number) =>
  writeStoredArray(scopedKey(SAVED_MEETING_STORAGE_KEY, projectId), SAVED_MEETINGS_UPDATED_EVENT, records);
