import { DEMO_PROJECT_ID } from "./taskApi";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api/v1";

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: { code: string; message: string } | null;
}

export interface TaskActivityDto {
  id: string;
  actorName: string;
  type: string;
  message: string;
  createdAt: string;
}

export async function fetchTaskActivity(taskId: string, projectId: number = DEMO_PROJECT_ID): Promise<TaskActivityDto[]> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/tasks/${taskId}/activities`);
  if (!response.ok) {
    throw new Error(`활동 로그 API 요청 실패: ${response.status}`);
  }
  const body = (await response.json()) as ApiEnvelope<TaskActivityDto[]>;
  if (!body.success) {
    throw new Error(body.error?.message ?? "활동 로그 API 요청 실패");
  }
  return body.data;
}
