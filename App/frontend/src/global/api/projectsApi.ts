import { apiFetch } from "./apiClient";
import type { ProjectRoleKo } from "./authTypes";

export interface ProjectResponse {
  id: number;
  title: string;
  type: string | null;
  deadline: string | null;
  description: string | null;
}

export interface CreateProjectRequest {
  title: string;
  type?: string;
  deadline?: string;
  description?: string;
}

export function listProjects() {
  return apiFetch<ProjectResponse[]>("/projects");
}

export function createProject(request: CreateProjectRequest) {
  return apiFetch<ProjectResponse>("/projects", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export interface InvitationResponse {
  projectId: number;
  email: string;
  role: ProjectRoleKo;
  token: string;
  status: string;
  expiresAt: string;
}

export function createInvitation(projectId: number, email: string, role: ProjectRoleKo) {
  return apiFetch<InvitationResponse>(`/projects/${projectId}/invitations`, {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
}
