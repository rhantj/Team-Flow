import type { ChecklistItem } from "../types/task";
import { DEMO_PROJECT_ID } from "./taskApi";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api/v1";

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: { code: string; message: string } | null;
}

interface ChecklistItemDto {
  id: string;
  title: string;
  done: boolean;
}

function toItem(dto: ChecklistItemDto): ChecklistItem {
  return { id: dto.id, label: dto.title, done: dto.done };
}

async function unwrap<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`체크리스트 API 요청 실패: ${response.status}`);
  }
  const body = (await response.json()) as ApiEnvelope<T>;
  if (!body.success) {
    throw new Error(body.error?.message ?? "체크리스트 API 요청 실패");
  }
  return body.data;
}

function checklistUrl(taskId: string, projectId: number): string {
  return `${API_BASE_URL}/projects/${projectId}/tasks/${taskId}/checklists`;
}

export async function fetchChecklist(taskId: string, projectId: number = DEMO_PROJECT_ID): Promise<ChecklistItem[]> {
  const response = await fetch(checklistUrl(taskId, projectId));
  const items = await unwrap<ChecklistItemDto[]>(response);
  return items.map(toItem);
}

export async function createChecklistItem(
  taskId: string,
  title: string,
  projectId: number = DEMO_PROJECT_ID
): Promise<ChecklistItem> {
  const response = await fetch(checklistUrl(taskId, projectId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  const dto = await unwrap<ChecklistItemDto>(response);
  return toItem(dto);
}

export interface UpdateChecklistItemInput {
  title?: string;
  done?: boolean;
}

export async function updateChecklistItem(
  taskId: string,
  itemId: string,
  input: UpdateChecklistItemInput,
  projectId: number = DEMO_PROJECT_ID
): Promise<ChecklistItem> {
  const response = await fetch(`${checklistUrl(taskId, projectId)}/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const dto = await unwrap<ChecklistItemDto>(response);
  return toItem(dto);
}

export async function deleteChecklistItem(taskId: string, itemId: string, projectId: number = DEMO_PROJECT_ID): Promise<void> {
  const response = await fetch(`${checklistUrl(taskId, projectId)}/${itemId}`, { method: "DELETE" });
  await unwrap<null>(response);
}
