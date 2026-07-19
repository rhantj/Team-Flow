import { DEMO_PROJECT_ID } from "./taskApi";
import { apiFetch } from "../../../global/api/apiClient";

export interface TaskActivityDto {
  id: string;
  actorName: string;
  type: string;
  message: string;
  createdAt: string;
}

export async function fetchTaskActivity(taskId: string, projectId: number = DEMO_PROJECT_ID): Promise<TaskActivityDto[]> {
  return apiFetch<TaskActivityDto[]>(`/projects/${projectId}/tasks/${taskId}/activities`);
}
