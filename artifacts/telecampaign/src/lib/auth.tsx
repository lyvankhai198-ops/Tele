import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AuthCaptcha } from "@workspace/api-client-react";
import { localizedErrorMessage, type Language } from "@/lib/i18n";

export type AuthUser = {
  id: string;
  username: string;
  role: "user" | "admin";
};

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  getCaptcha: () => Promise<AuthCaptcha>;
  register: (username: string, password: string, confirmPassword: string, captchaChallengeId: string, captchaCode: string) => Promise<void>;
  login: (username: string, password: string, captchaChallengeId: string, captchaCode: string) => Promise<void>;
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
    throw new Error(typeof payload?.error === "string" ? payload.error : serverFallback[language]);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
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

  const getCaptcha = useCallback(async () => {
    return authRequest<AuthCaptcha>("/captcha", currentLanguage(), {
      cache: "no-store",
    });
  }, []);

  const register = useCallback(async (
    username: string,
    password: string,
    confirmPassword: string,
    captchaChallengeId: string,
    captchaCode: string,
  ) => {
    const currentUser = await authRequest<AuthUser>("/register", currentLanguage(), {
      method: "POST",
      body: JSON.stringify({ username, password, confirmPassword, captchaChallengeId, captchaCode }),
    });
    queryClient.clear();
    setUser(currentUser);
  }, [queryClient]);

  const login = useCallback(async (
    username: string,
    password: string,
    captchaChallengeId: string,
    captchaCode: string,
  ) => {
    const currentUser = await authRequest<AuthUser>("/login", currentLanguage(), {
      method: "POST",
      body: JSON.stringify({ username, password, captchaChallengeId, captchaCode }),
    });
    queryClient.clear();
    setUser(currentUser);
  }, [queryClient]);

  const logout = useCallback(async () => {
    try {
      await authRequest<void>("/logout", currentLanguage(), { method: "POST" });
    } finally {
      queryClient.clear();
      setUser(null);
    }
  }, [queryClient]);

  const value = useMemo(
    () => ({ user, isLoading, getCaptcha, register, login, logout }),
    [getCaptcha, isLoading, login, logout, register, user],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
