import { apiFetch } from "./apiClient";
import type { ProjectRoleKo } from "./authTypes";

export interface ProjectResponse {
  id: number;
  title: string;
  type: string | null;
  deadline: string | null;
  description: string | null;
  startDate: string | null;
  midCheckDate: string | null;
  memberLimit: number | null;
  deliverables: string[] | null;
  techStack: string[] | null;
  goals: string | null;
  inviteCode: string | null;
  createdBy: number | null;
  memberCount: number;
  taskProgress: number;
}

export interface CreateProjectRequest {
  title: string;
  type?: string;
  description?: string;
  startDate?: string;
  deadline?: string;
  midCheckDate?: string;
  memberLimit?: number;
  deliverables?: string[];
  techStack?: string[];
  goals?: string;
}

export type UpdateProjectRequest = Partial<CreateProjectRequest>;

export function listProjects() {
  return apiFetch<ProjectResponse[]>("/projects");
}

export function createProject(request: CreateProjectRequest) {
  return apiFetch<ProjectResponse>("/projects", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function getProject(projectId: number) {
  return apiFetch<ProjectResponse>(`/projects/${projectId}`);
}

export function updateProject(projectId: number, request: UpdateProjectRequest) {
  return apiFetch<ProjectResponse>(`/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify(request),
  });
}

export function joinProjectByCode(code: string) {
  return apiFetch<ProjectResponse>("/projects/join", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export interface MemberResponse {
  userId: number;
  name: string;
  email: string;
  role: ProjectRoleKo;
}

export function getProjectMembers(projectId: number) {
  return apiFetch<MemberResponse[]>(`/projects/${projectId}/members`);
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
