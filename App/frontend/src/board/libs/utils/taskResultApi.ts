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
  content: string,
  projectId: number = DEMO_PROJECT_ID
): Promise<TaskResultDto> {
  return apiFetch<TaskResultDto>(resultPath(taskId, projectId), {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
}

export async function addTaskResultLink(
  taskId: string,
  url: string,
  title: string,
  projectId: number = DEMO_PROJECT_ID
): Promise<TaskResultLinkDto> {
  return apiFetch<TaskResultLinkDto>(`${resultPath(taskId, projectId)}/links`, {
    method: "POST",
    body: JSON.stringify({ url, title }),
  });
}

export async function deleteTaskResultLink(
  taskId: string,
  linkId: string,
  projectId: number = DEMO_PROJECT_ID
): Promise<void> {
  await apiFetch<null>(`${resultPath(taskId, projectId)}/links/${linkId}`, { method: "DELETE" });
}

export async function uploadTaskResultFile(
  taskId: string,
  file: File,
  projectId: number = DEMO_PROJECT_ID
): Promise<TaskResultFileDto> {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch<TaskResultFileDto>(`${resultPath(taskId, projectId)}/files`, {
    method: "POST",
    body: formData,
  });
}

export async function deleteTaskResultFile(
  taskId: string,
  fileId: string,
  projectId: number = DEMO_PROJECT_ID
): Promise<void> {
  await apiFetch<null>(`${resultPath(taskId, projectId)}/files/${fileId}`, { method: "DELETE" });
}

export async function getTaskResultFileUrl(
  taskId: string,
  fileId: string,
  projectId: number = DEMO_PROJECT_ID
): Promise<string> {
  return apiFetch<string>(`${resultPath(taskId, projectId)}/files/${fileId}/url`);
}
