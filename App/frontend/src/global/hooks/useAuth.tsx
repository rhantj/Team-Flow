import { createContext, useContext, useState, type ReactNode } from "react";

export type AppRole = "ADMIN" | "LEADER" | "MEMBER" | "JUDGE";

interface AuthState {
  isAuthenticated: boolean;
  signupName: string;
  appRole: AppRole | null;
  currentProjectRole: AppRole | null;
  currentProjectName: string;
  login: (role?: AppRole | null) => void;
  completeSignup: (name: string) => void;
  approveProfessorSignup: (name: string) => void;
  completeOnboarding: () => void;
  setProjectContext: (role: AppRole, projectName: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [signupName, setSignupName] = useState("");
  const [appRole, setAppRole] = useState<AppRole | null>(null);
  const [currentProjectRole, setCurrentProjectRole] = useState<AppRole | null>(null);
  const [currentProjectName, setCurrentProjectName] = useState("프로젝트 선택 전");

  const login = (role: AppRole | null = null) => {
    setIsAuthenticated(true);
    setAppRole(role);
    setCurrentProjectRole(role);
    if (role === "JUDGE") {
      setCurrentProjectName("심사 프로젝트 선택 전");
    }
  };
  const completeSignup = (name: string) => setSignupName(name);
  const approveProfessorSignup = (name: string) => {
    setSignupName(name);
    setIsAuthenticated(true);
    setAppRole("JUDGE");
    setCurrentProjectRole("JUDGE");
    setCurrentProjectName("심사 프로젝트 선택 전");
  };
  const completeOnboarding = () => setIsAuthenticated(true);
  const setProjectContext = (role: AppRole, projectName: string) => {
    setAppRole(role);
    setCurrentProjectRole(role);
    setCurrentProjectName(projectName);
  };
  const logout = () => {
    setIsAuthenticated(false);
    setSignupName("");
    setAppRole(null);
    setCurrentProjectRole(null);
    setCurrentProjectName("프로젝트 선택 전");
  };

  return (
    <AuthContext.Provider value={{
      isAuthenticated,
      signupName,
      appRole,
      currentProjectRole,
      currentProjectName,
      login,
      completeSignup,
      approveProfessorSignup,
      completeOnboarding,
      setProjectContext,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
