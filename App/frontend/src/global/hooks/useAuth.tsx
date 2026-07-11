import { createContext, useContext, useState, type ReactNode } from "react";

interface AuthState {
  isAuthenticated: boolean;
  signupName: string;
  login: () => void;
  completeSignup: (name: string) => void;
  completeOnboarding: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [signupName, setSignupName] = useState("");

  const login = () => setIsAuthenticated(true);
  const completeSignup = (name: string) => setSignupName(name);
  const completeOnboarding = () => setIsAuthenticated(true);

  return (
    <AuthContext.Provider value={{ isAuthenticated, signupName, login, completeSignup, completeOnboarding }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
