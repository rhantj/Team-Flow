export type ProjectRoleKo = "팀장" | "팀원" | "심사자";

export interface UserSummary {
  id: number;
  email: string;
  name: string;
}

export interface ProjectRoleSummary {
  projectId: number;
  projectTitle: string | null;
  role: ProjectRoleKo;
}

export interface MeResponse {
  user: UserSummary;
  projectRoles: ProjectRoleSummary[];
}

export interface AuthTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: UserSummary;
}
