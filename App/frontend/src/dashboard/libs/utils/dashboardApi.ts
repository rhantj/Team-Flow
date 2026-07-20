import type { ActivityItemDto, DashboardSummaryResponse, DashboardTaskDto, ProgressDetailResponse } from "../types/dashboard";
import { apiFetch } from "../../../global/api/apiClient";

export async function fetchDashboardSummary(projectId: string | number): Promise<DashboardSummaryResponse> {
  return apiFetch<DashboardSummaryResponse>(`/projects/${projectId}/dashboard/summary`);
}

export async function fetchDashboardProgress(projectId: string | number): Promise<ProgressDetailResponse> {
  return apiFetch<ProgressDetailResponse>(`/projects/${projectId}/dashboard/progress`);
}

export async function fetchDashboardTasks(projectId: string | number): Promise<DashboardTaskDto[]> {
  return apiFetch<DashboardTaskDto[]>(`/projects/${projectId}/dashboard/tasks`);
}

export async function fetchDashboardActivities(projectId: string | number): Promise<ActivityItemDto[]> {
  return apiFetch<ActivityItemDto[]>(`/projects/${projectId}/dashboard/activities`);
}

export async function refreshDelayRisk(projectId: string | number): Promise<ProgressDetailResponse> {
  return apiFetch<ProgressDetailResponse>(`/projects/${projectId}/dashboard/delay-risk/refresh`, {
    method: "POST",
  });
}
