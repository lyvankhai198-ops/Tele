export const RELEASE_PREFIX = "telecamp_release:";
export type ReleaseState = "draft" | "sending" | "sent" | "failed" | "unknown";
export type ReleaseContent = { title: string; vi: string; en: string };
export type ReleaseUpdate = ReleaseContent & {
  id: string; version: number; status: ReleaseState; createdAt: string; updatedAt: string;
  deletedAt: string | null; sentAt: string | null; sendingAt: string | null;
  sentMessageId: number | null; destination: string | null; sentText: string | null;
};
export class ReleaseError extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 409) { super(code); this.code = code; this.status = status; }
}
export function releaseId(value: unknown): string {
  if (typeof value !== "string" || !/^(?:[0-9a-f]{40}|manual-[0-9a-f-]{36})$/.test(value)) {
    throw new ReleaseError("RELEASE_INVALID_ID", 400);
  }
  return value;
}
export function releaseContent(value: unknown): ReleaseContent {
  const data = value as Partial<ReleaseContent> | null;
  if (!data || typeof data.title !== "string" || !data.title.trim() || data.title.trim().length > 200 ||
    typeof data.vi !== "string" || !data.vi.trim() || data.vi.trim().length > 1750 ||
    typeof data.en !== "string" || !data.en.trim() || data.en.trim().length > 1750) {
    throw new ReleaseError("RELEASE_BILINGUAL_REQUIRED", 400);
  }
  return { title: data.title.trim(), vi: data.vi.trim(), en: data.en.trim() };
}
export function parseReleaseNote(note: string): ReleaseContent {
  const match = note.trim().match(/(?:^|\r?\n)\[VI\][ \t]*\r?\n([\s\S]+?)\r?\n\[EN\][ \t]*\r?\n([\s\S]+)$/);
  if (!match || /\r?\n\[(VI|EN)\]/.test(match[1] + "\n" + match[2])) {
    throw new ReleaseError("RELEASE_BILINGUAL_REQUIRED", 400);
  }
  const bound = (text: string) => text.trim().length <= 1750 ? text.trim()
    : text.trim().slice(0, 1749).replace(/[\uD800-\uDBFF]$/, "").trimEnd() + "…";
  const heading = note.slice(0, match.index).trim().split(/\r?\n/)[0] || "TeleCamp";
  return releaseContent({ title: heading.slice(0, 200), vi: bound(match[1]), en: bound(match[2]) });
}
export function releaseText(content: ReleaseContent): string {
  const c = releaseContent(content);
  return `TELECAMP — CẬP NHẬT / UPDATE\n${c.title}\n\nTIẾNG VIỆT\n${c.vi}\n\nENGLISH\n${c.en}`;
}
export function visibleRelease(record: ReleaseUpdate, now = Date.now()): ReleaseUpdate {
  // A crash after reserving a send must never make the update sendable again.
  return record.status === "sending" && now - Date.parse(record.sendingAt ?? "") > 120_000
    ? { ...record, status: "unknown" } : record;
}
