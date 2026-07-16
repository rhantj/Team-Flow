import { DEMO_PROJECT_ID } from "./taskApi";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api/v1";

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: { code: string; message: string } | null;
}

export interface TaskCommentDto {
  id: string;
  authorId: string | null;
  authorName: string;
  content: string;
  createdAt: string;
}

async function unwrap<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`코멘트 API 요청 실패: ${response.status}`);
  }
  const body = (await response.json()) as ApiEnvelope<T>;
  if (!body.success) {
    throw new Error(body.error?.message ?? "코멘트 API 요청 실패");
  }
  return body.data;
}

function commentsUrl(taskId: string, projectId: number): string {
  return `${API_BASE_URL}/projects/${projectId}/tasks/${taskId}/comments`;
}

export async function fetchTaskComments(taskId: string, projectId: number = DEMO_PROJECT_ID): Promise<TaskCommentDto[]> {
  const response = await fetch(commentsUrl(taskId, projectId));
  return unwrap<TaskCommentDto[]>(response);
}

export async function createTaskComment(
  taskId: string,
  authorId: string,
  content: string,
  projectId: number = DEMO_PROJECT_ID
): Promise<TaskCommentDto> {
  const response = await fetch(commentsUrl(taskId, projectId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ authorId, content }),
  });
  return unwrap<TaskCommentDto>(response);
}

export async function updateTaskComment(
  taskId: string,
  commentId: string,
  content: string,
  projectId: number = DEMO_PROJECT_ID
): Promise<TaskCommentDto> {
  const response = await fetch(`${commentsUrl(taskId, projectId)}/${commentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  return unwrap<TaskCommentDto>(response);
}

export async function deleteTaskComment(taskId: string, commentId: string, projectId: number = DEMO_PROJECT_ID): Promise<void> {
  const response = await fetch(`${commentsUrl(taskId, projectId)}/${commentId}`, { method: "DELETE" });
  await unwrap<null>(response);
}
