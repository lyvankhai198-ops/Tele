export const ADMIN_HISTORY_KEY = "telecampAdminNavigation";
export type AdminHistoryEntry = {
  version: 1;
  owner: string;
  path: string;
  previous: string | null;
};
export type NavigationAction = "initial" | "push" | "replace" | "pop";

export function isAdminPath(path: unknown): path is string {
  if (typeof path !== "string" || /[\\\r\n]/.test(path) || !path.startsWith("/")) return false;
  const pathname = path.split(/[?#]/, 1)[0];
  return pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/dashboard/feedback";
}

export function adminParentPath(path: string) {
  return /^\/admin\/users\/[^/]+\/support(?:[?#]|$)/.test(path) ? "/admin/users" : "/admin";
}

export function validAdminEntry(value: unknown, owner: string, path: string): value is AdminHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<AdminHistoryEntry>;
  return entry.version === 1 && entry.owner === owner && entry.path === path && isAdminPath(entry.path)
    && (entry.previous === null || (isAdminPath(entry.previous) && entry.previous !== path));
}

export function nextAdminEntry(input: {
  owner: string;
  path: string;
  action: NavigationAction;
  existing?: unknown;
  previous?: AdminHistoryEntry | null;
}): AdminHistoryEntry | null {
  const { owner, path, action, existing, previous } = input;
  if (!isAdminPath(path) || !owner) return null;
  if (validAdminEntry(existing, owner, path)) return existing;
  let target: string | null = null;
  if (previous?.owner === owner) {
    if (action === "push" && previous.path !== path && isAdminPath(previous.path)) target = previous.path;
    if (action === "replace" && previous.previous !== path && isAdminPath(previous.previous)) target = previous.previous;
  }
  return { version: 1, owner, path, previous: target };
}
