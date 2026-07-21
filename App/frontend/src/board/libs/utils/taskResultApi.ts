import { DEMO_PROJECT_ID } from "./taskApi";
import { apiFetch } from "../../../global/api/apiClient";

export interface TaskResultLinkDto {
  id: string;
  url: string;
  title: string;
}

export interface TaskResultFileDto {
  id: string;
  fileName: string;
  size: number;
  contentType: string | null;
}

export interface TaskResultDto {
  content: string;
  updatedAt: string | null;
  links: TaskResultLinkDto[];
  files: TaskResultFileDto[];
}

function resultPath(taskId: string, projectId: number): string {
  return `/projects/${projectId}/tasks/${taskId}/result`;
}

export async function fetchTaskResult(taskId: string, projectId: number = DEMO_PROJECT_ID): Promise<TaskResultDto> {
  return apiFetch<TaskResultDto>(resultPath(taskId, projectId));
}

export async function saveTaskResult(
  taskId: string,
  userId: number,
  content: string,
  projectId: number = DEMO_PROJECT_ID
): Promise<TaskResultDto> {
  return apiFetch<TaskResultDto>(resultPath(taskId, projectId), {
    method: "PUT",
    body: JSON.stringify({ userId, content }),
  });
}

export async function addTaskResultLink(
  taskId: string,
  userId: number,
  url: string,
  title: string,
  projectId: number = DEMO_PROJECT_ID
): Promise<TaskResultLinkDto> {
  return apiFetch<TaskResultLinkDto>(`${resultPath(taskId, projectId)}/links`, {
    method: "POST",
    body: JSON.stringify({ userId, url, title }),
  });
}

export async function deleteTaskResultLink(
  taskId: string,
  linkId: string,
  userId: number,
  projectId: number = DEMO_PROJECT_ID
): Promise<void> {
  await apiFetch<null>(`${resultPath(taskId, projectId)}/links/${linkId}?userId=${userId}`, { method: "DELETE" });
}

export async function uploadTaskResultFile(
  taskId: string,
  userId: number,
  file: File,
  projectId: number = DEMO_PROJECT_ID
): Promise<TaskResultFileDto> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("userId", String(userId));
  return apiFetch<TaskResultFileDto>(`${resultPath(taskId, projectId)}/files`, {
    method: "POST",
    body: formData,
  });
}

export async function deleteTaskResultFile(
  taskId: string,
  fileId: string,
  userId: number,
  projectId: number = DEMO_PROJECT_ID
): Promise<void> {
  await apiFetch<null>(`${resultPath(taskId, projectId)}/files/${fileId}?userId=${userId}`, { method: "DELETE" });
}

export async function getTaskResultFileUrl(
  taskId: string,
  fileId: string,
  projectId: number = DEMO_PROJECT_ID
): Promise<string> {
  return apiFetch<string>(`${resultPath(taskId, projectId)}/files/${fileId}/url`);
}
