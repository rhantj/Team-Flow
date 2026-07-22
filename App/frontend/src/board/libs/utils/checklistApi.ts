import type { ChecklistItem } from "../types/task";
import { DEMO_PROJECT_ID } from "./taskApi";
import { apiFetch } from "../../../global/api/apiClient";

interface ChecklistItemDto {
  id: string;
  title: string;
  done: boolean;
}

function toItem(dto: ChecklistItemDto): ChecklistItem {
  return { id: dto.id, label: dto.title, done: dto.done };
}

function checklistPath(taskId: string, projectId: number): string {
  return `/projects/${projectId}/tasks/${taskId}/checklists`;
}

export async function fetchChecklist(taskId: string, projectId: number = DEMO_PROJECT_ID): Promise<ChecklistItem[]> {
  const items = await apiFetch<ChecklistItemDto[]>(checklistPath(taskId, projectId));
  return items.map(toItem);
}

export async function createChecklistItem(
  taskId: string,
  title: string,
  projectId: number = DEMO_PROJECT_ID
): Promise<ChecklistItem> {
  const dto = await apiFetch<ChecklistItemDto>(checklistPath(taskId, projectId), {
    method: "POST",
    body: JSON.stringify({ title }),
  });
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
  const dto = await apiFetch<ChecklistItemDto>(`${checklistPath(taskId, projectId)}/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return toItem(dto);
}

export async function deleteChecklistItem(taskId: string, itemId: string, projectId: number = DEMO_PROJECT_ID): Promise<void> {
  await apiFetch<null>(`${checklistPath(taskId, projectId)}/${itemId}`, { method: "DELETE" });
}

export interface ChecklistPreview {
  titles: string[];
  engine: string;
}

export async function generateChecklistPreview(
  taskId: string,
  projectId: number = DEMO_PROJECT_ID
): Promise<ChecklistPreview> {
  return apiFetch<ChecklistPreview>(`${checklistPath(taskId, projectId)}/generate-preview`, {
    method: "POST",
  });
}

export async function applyGeneratedChecklist(
  taskId: string,
  titles: string[],
  projectId: number = DEMO_PROJECT_ID
): Promise<ChecklistItem[]> {
  const items = await apiFetch<ChecklistItemDto[]>(`${checklistPath(taskId, projectId)}/apply-generated`, {
    method: "POST",
    body: JSON.stringify({ titles }),
  });
  return items.map(toItem);
}
