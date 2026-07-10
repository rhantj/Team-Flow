import { Navigate, Outlet } from "react-router";
import { useAuth } from "./useAuth";

export function RequireAuth() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}
