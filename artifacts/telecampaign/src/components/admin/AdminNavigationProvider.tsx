import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/lib/auth";
import { ADMIN_HISTORY_KEY, adminParentPath, nextAdminEntry, validAdminEntry,
  type AdminHistoryEntry, type NavigationAction } from "@/lib/admin-navigation";

const NavigationContext = createContext({ canGoBack: false, goBack: () => {} });

export function AdminNavigationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [location, navigate] = useLocation();
  const search = useSearch();
  const path = location + (search ? `?${search}` : "");
  const owner = user?.role === "admin" && !user.support ? user.id : "";
  const [entry, setEntry] = useState<AdminHistoryEntry | null>(null);
  const previous = useRef<AdminHistoryEntry | null>(null);
  const action = useRef<NavigationAction>("initial");
  const annotating = useRef(false);

  useLayoutEffect(() => {
    const push = () => { if (!annotating.current) action.current = "push"; };
    const replace = () => { if (!annotating.current) action.current = "replace"; };
    const pop = () => { action.current = "pop"; };
    window.addEventListener("pushState", push);
    window.addEventListener("replaceState", replace);
    window.addEventListener("popstate", pop);
    return () => {
      window.removeEventListener("pushState", push);
      window.removeEventListener("replaceState", replace);
      window.removeEventListener("popstate", pop);
    };
  }, []);

  useLayoutEffect(() => {
    const state = window.history.state;
    const next = nextAdminEntry({ owner, path, action: action.current,
      existing: state?.[ADMIN_HISTORY_KEY], previous: previous.current });
    previous.current = next;
    setEntry(next);
    action.current = "initial";
    if (!next || validAdminEntry(state?.[ADMIN_HISTORY_KEY], owner, path)) return;
    try {
      annotating.current = true;
      window.history.replaceState({
        ...(state && typeof state === "object" && !Array.isArray(state) ? state : {}),
        [ADMIN_HISTORY_KEY]: next,
      }, "");
    } catch {
      // Restricted browser history still allows the safe parent-route fallback.
    } finally {
      annotating.current = false;
    }
  }, [owner, path]);

  function goBack() {
    const marker = window.history.state?.[ADMIN_HISTORY_KEY];
    if (validAdminEntry(marker, owner, path) && marker.previous && window.history.length > 1) {
      window.history.back();
      return;
    }
    const fallback = adminParentPath(path);
    // Direct links and reloads without a known admin predecessor never leave admin.
    navigate(fallback, { replace: true, state: { [ADMIN_HISTORY_KEY]: {
      version: 1, owner, path: fallback, previous: null,
    } satisfies AdminHistoryEntry } });
  }

  return <NavigationContext.Provider value={{
    canGoBack: Boolean(owner && entry && (entry.previous || location !== "/admin")),
    goBack,
  }}>{children}</NavigationContext.Provider>;
}

export function useAdminBack() {
  return useContext(NavigationContext);
}
