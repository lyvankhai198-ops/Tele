import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { localizedErrorMessage, type Language } from "@/lib/i18n";

export type AuthUser = {
  id: string;
  username: string;
  role: "user" | "admin";
};

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  register: (username: string, password: string, confirmPassword: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const serverFallback: Record<Language, string> = {
  en: "Could not connect to server. Please try again.",
  vi: "Không thể kết nối máy chủ. Vui lòng thử lại",
};

function currentLanguage(): Language {
  if (typeof window === "undefined") return "vi";
  return window.localStorage.getItem("telecampaign-language") === "en" ? "en" : "vi";
}

async function authRequest<T>(path: string, language: Language, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/auth${path}`, {
    credentials: "same-origin",
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
    ...init,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(localizedErrorMessage(
      payload?.error ? new Error(payload.error) : null,
      language,
      serverFallback[language],
    ));
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const currentUser = await authRequest<AuthUser>("/me", currentLanguage());
      setUser(currentUser);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const register = useCallback(async (username: string, password: string, confirmPassword: string) => {
    const currentUser = await authRequest<AuthUser>("/register", currentLanguage(), {
      method: "POST",
      body: JSON.stringify({ username, password, confirmPassword }),
    });
    setUser(currentUser);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const currentUser = await authRequest<AuthUser>("/login", currentLanguage(), {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setUser(currentUser);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authRequest<void>("/logout", currentLanguage(), { method: "POST" });
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({ user, isLoading, register, login, logout }), [isLoading, login, logout, register, user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
