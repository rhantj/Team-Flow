import { DEMO_PROJECT_ID } from "./taskApi";
import { apiFetch } from "../../../global/api/apiClient";

export interface TaskCommentDto {
  id: string;
  authorId: string | null;
  authorName: string;
  content: string;
  createdAt: string;
}

function commentsPath(taskId: string, projectId: number): string {
  return `/projects/${projectId}/tasks/${taskId}/comments`;
}

export async function fetchTaskComments(taskId: string, projectId: number = DEMO_PROJECT_ID): Promise<TaskCommentDto[]> {
  return apiFetch<TaskCommentDto[]>(commentsPath(taskId, projectId));
}

export async function createTaskComment(
  taskId: string,
  authorId: string,
  content: string,
  projectId: number = DEMO_PROJECT_ID
): Promise<TaskCommentDto> {
  return apiFetch<TaskCommentDto>(commentsPath(taskId, projectId), {
    method: "POST",
    body: JSON.stringify({ authorId, content }),
  });
}

export async function updateTaskComment(
  taskId: string,
  commentId: string,
  content: string,
  projectId: number = DEMO_PROJECT_ID
): Promise<TaskCommentDto> {
  return apiFetch<TaskCommentDto>(`${commentsPath(taskId, projectId)}/${commentId}`, {
    method: "PATCH",
    body: JSON.stringify({ content }),
  });
}

export async function deleteTaskComment(taskId: string, commentId: string, projectId: number = DEMO_PROJECT_ID): Promise<void> {
  await apiFetch<null>(`${commentsPath(taskId, projectId)}/${commentId}`, { method: "DELETE" });
}
