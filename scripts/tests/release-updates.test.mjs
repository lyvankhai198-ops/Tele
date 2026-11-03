import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseReleaseNote, releaseContent, releaseId, releaseText, visibleRelease } from "../../artifacts/api-server/src/lib/release-update-core.ts";
import { createRelease, listReleases } from "../../artifacts/api-server/src/lib/release-update-store.ts";

const content = { title: "Bản sửa cụ thể", vi: "Đã sửa đúng phần.", en: "Fixed the scoped feature." };
test("release parser requires both actual translations and retains the title", () => {
  assert.deepEqual(parseReleaseNote(`${content.title}\n\n[VI]\n${content.vi}\n\n[EN]\n${content.en}`), content);
  for (const value of ["", "Legacy text", "[VI]\nA", "[VI]\n \n[EN]\nB"]) assert.throws(() => parseReleaseNote(value));
  assert.throws(() => releaseContent({ ...content, en: " " }));
});
test("preview text stays plain and below Telegram's limit with both full sections", () => {
  const text = releaseText({ title: "A".repeat(200), vi: "V".repeat(1750), en: "E".repeat(1750) });
  assert.ok(text.length < 4096);
  assert.match(text, /TIẾNG VIỆT\nV/);
  assert.match(text, /ENGLISH\nE/);
  assert.equal(releaseText(content).includes(content.title), true);
});
test("strict release identifiers do not accept arbitrary setting keys", () => {
  assert.equal(releaseId("a".repeat(40)), "a".repeat(40));
  for (const id of ["admin_system_settings", "../secret", "", "' OR true", "manual-not-a-uuid"]) assert.throws(() => releaseId(id));
});
test("stale sending remains unknown, never becomes a retryable draft", () => {
  const record = { ...content, status: "sending", sendingAt: "2026-01-01T00:00:00Z" };
  assert.equal(visibleRelease(record, Date.parse("2026-01-01T00:01:00Z")).status, "sending");
  assert.equal(visibleRelease(record, Date.parse("2026-01-01T00:03:00Z")).status, "unknown");
});
test("deployment draft creation is idempotent and cannot resurrect deleted records", async () => {
  const records = new Map(), db = { async query(sql, values) {
    if (sql.startsWith("INSERT")) {
      if (records.has(values[0])) return { rows: [] };
      records.set(values[0], values[1]); return { rows: [{ key: values[0] }] };
    }
    return { rows: [...records.values()].map(value => ({ value })) };
  } };
  const id = "a".repeat(40);
  assert.equal((await createRelease(db, content, "fixture", id)).status, "draft");
  assert.equal(await createRelease(db, content, "fixture", id), null);
  const key = [...records.keys()][0], record = JSON.parse(records.get(key));
  records.set(key, JSON.stringify({ ...record, deletedAt: new Date().toISOString() }));
  assert.equal(await createRelease(db, content, "fixture", id), null);
  assert.deepEqual(await listReleases(db), []);
});
test("default deployment and group configuration never call a send function", () => {
  const cli = fs.readFileSync(new URL("../refresh-telecampaign-bot-menu.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(cli, /call\(["']sendMessage|await refreshAdminMenu/);
  assert.match(cli, /createRelease\(client/);
  assert.match(cli, /release_announcement=not_sent/);
  const workflow = fs.readFileSync(new URL("../../.github/workflows/telecampaign-deploy.yml", import.meta.url), "utf8");
  assert.match(workflow, /release_announcement=not_sent/);
  assert.doesNotMatch(workflow, /bot_update_delivery=passed/);
});
