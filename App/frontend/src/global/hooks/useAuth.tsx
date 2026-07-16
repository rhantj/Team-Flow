import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { API_BASE_URL, apiFetch, AUTH_LOGOUT_EVENT } from "../api/apiClient";
import { tokenStore } from "../api/tokenStore";
import type { MeResponse, ProjectRoleSummary, UserSummary } from "../api/authTypes";

interface AuthState {
  isAuthenticated: boolean;
  loading: boolean;
  user: UserSummary | null;
  projectRoles: ProjectRoleSummary[];
  loginWithGoogle: () => void;
  logout: () => void;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserSummary | null>(null);
  const [projectRoles, setProjectRoles] = useState<ProjectRoleSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMe = async () => {
    if (!tokenStore.getAccessToken()) {
      setUser(null);
      setProjectRoles([]);
      setLoading(false);
      return;
    }
    try {
      const me = await apiFetch<MeResponse>("/me");
      setUser(me.user);
      setProjectRoles(me.projectRoles);
    } catch (err) {
      tokenStore.clear();
      setUser(null);
      setProjectRoles([]);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMe().catch(() => {});

    const handleForcedLogout = () => {
      setUser(null);
      setProjectRoles([]);
    };
    window.addEventListener(AUTH_LOGOUT_EVENT, handleForcedLogout);
    return () => window.removeEventListener(AUTH_LOGOUT_EVENT, handleForcedLogout);
  }, []);

  const loginWithGoogle = () => {
    window.location.href = `${API_BASE_URL}/auth/google`;
  };

  const logout = () => {
    apiFetch("/auth/logout", { method: "POST" }).catch(() => {});
    tokenStore.clear();
    setUser(null);
    setProjectRoles([]);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!user,
        loading,
        user,
        projectRoles,
        loginWithGoogle,
        logout,
        refreshMe: loadMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
