import { Navigate, Outlet, useParams } from "react-router";
import { useAuth } from "./useAuth";
import type { ProjectRoleKo } from "../api/authTypes";

export function RequireAuth() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">로딩 중...</div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function RequireRole({ allow }: { allow: ProjectRoleKo[] }) {
  const { currentProject, projectRoles } = useAuth();
  const { projectId } = useParams();

  const currentRole = projectId
    ? projectRoles.find(pr => String(pr.projectId) === projectId)?.role
    : currentProject?.role ?? projectRoles[0]?.role;

  if (!currentRole || !allow.includes(currentRole)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}
