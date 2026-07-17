import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { API_BASE_URL, apiFetch, AUTH_LOGOUT_EVENT } from "../api/apiClient";
import { tokenStore } from "../api/tokenStore";
import type { MeResponse, ProjectRoleSummary, UserSummary } from "../api/authTypes";

const SELECTED_PROJECT_KEY = "workflow-ai:selected-project-id";

interface AuthState {
  isAuthenticated: boolean;
  loading: boolean;
  user: UserSummary | null;
  projectRoles: ProjectRoleSummary[];
  currentProjectId: number | null;
  currentProject: ProjectRoleSummary | null;
  selectProject: (projectId: number) => void;
  loginWithGoogle: () => void;
  logout: () => void;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserSummary | null>(null);
  const [projectRoles, setProjectRoles] = useState<ProjectRoleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);

  // projectRoles가 (최초 로드/새 프로젝트 생성 등으로) 바뀔 때마다, 저장된 선택이 여전히 유효하면 유지하고
  // 아니면(첫 로드, 그 프로젝트에서 빠짐 등) 첫 번째 프로젝트로 폴백한다.
  useEffect(() => {
    if (projectRoles.length === 0) {
      setCurrentProjectId(null);
      return;
    }
    const stored = Number(localStorage.getItem(SELECTED_PROJECT_KEY));
    const stillValid = stored && projectRoles.some((pr) => pr.projectId === stored);
    setCurrentProjectId(stillValid ? stored : projectRoles[0].projectId);
  }, [projectRoles]);

  const selectProject = (projectId: number) => {
    setCurrentProjectId(projectId);
    localStorage.setItem(SELECTED_PROJECT_KEY, String(projectId));
  };

  const currentProject = projectRoles.find((pr) => pr.projectId === currentProjectId) ?? null;

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
        currentProjectId,
        currentProject,
        selectProject,
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
