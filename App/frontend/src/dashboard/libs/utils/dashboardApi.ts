import type { DashboardSummaryResponse, ProgressDetailResponse } from "../types/dashboard";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api/v1";

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: { code: string; message: string } | null;
}

async function unwrap<T>(response: Response, action: string): Promise<T> {
  if (!response.ok) throw new Error(`${action} failed: ${response.status}`);
  const body = (await response.json()) as ApiEnvelope<T>;
  if (!body.success) throw new Error(body.error?.message ?? `${action} failed`);
  return body.data;
}

export async function fetchDashboardSummary(projectId: string): Promise<DashboardSummaryResponse> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/dashboard/summary`);
  return unwrap<DashboardSummaryResponse>(response, "Dashboard summary fetch");
}

export async function fetchDashboardProgress(projectId: string): Promise<ProgressDetailResponse> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/dashboard/progress`);
  return unwrap<ProgressDetailResponse>(response, "Dashboard progress fetch");
}

export async function refreshDelayRisk(projectId: string): Promise<ProgressDetailResponse> {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/dashboard/delay-risk/refresh`, {
    method: "POST",
  });
  return unwrap<ProgressDetailResponse>(response, "Delay risk refresh");
}
