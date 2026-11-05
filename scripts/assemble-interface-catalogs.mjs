import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = JSON.parse(fs.readFileSync(path.join(root, "scripts/interface-catalog-source.json"), "utf8"));
const drafts = path.join(root, "scripts/locale-drafts");
const output = path.join(root, "artifacts/telecampaign/src/lib/locale-catalogs");
const codes = ["vi", "en", "lo", "ms", "ja", "th", "ko", "zh-Hans", "zh-Hant", "ru", "hi", "ar", "fil", "de", "my", "ur", "si", "id", "nl", "sr", "hy", "bn"];
const catalogs = new Map(codes.map((code) => [code, new Map()]));
// Normalize only curated interface copy, never customer content or technical IDs.
// Retain legacy source keys so older server messages remain recognizable.
const displayBrand = (value) => value.replace(/\bTele(?:\s+)?Camp(?:aign)?\b/gu, "Telecampaign");
// Committed catalogs are curated source. Local authoring drafts are optional
// incremental overrides, not a prerequisite for reproducing a release.
for (const code of codes) {
  const file = path.join(output, `${code}.json`);
  if (fs.existsSync(file)) {
    const entries = Object.entries(JSON.parse(fs.readFileSync(file, "utf8")));
    const catalog = new Map(entries);
    for (const [key, value] of entries) {
      const normalizedKey = displayBrand(key);
      if (!catalog.has(normalizedKey)) catalog.set(normalizedKey, displayBrand(value));
    }
    catalogs.set(code, catalog);
  }
}
const repairsPath = path.join(drafts, "repairs.json");
const repairs = new Map((fs.existsSync(repairsPath) ? JSON.parse(fs.readFileSync(repairsPath, "utf8")) : [])
  .map((repair) => [`${repair.file}:${repair.row}`, repair]));
const placeholders = (value) => [...value.matchAll(/\{\{[^{}]+\}\}/gu)].map((match) => match[0]).sort();
for (const key of source.sources) {
  if (!catalogs.get("en").has(key)) catalogs.get("en").set(key, key);
}
for (const [vi, en] of Object.entries(source.aliases)) {
  if (!catalogs.get("vi").has(en)) {
    const englishPluralMarkers = [...en.matchAll(/\b(?:day|hour|minute|second|account|campaign|group|message|key)\{\{(\d+)\}\}/gu)]
      .map((match) => `{{${match[1]}}}`);
    const missingPluralMarkers = englishPluralMarkers.filter((marker) => !vi.includes(marker));
    catalogs.get("vi").set(en, vi + missingPluralMarkers.join(""));
  }
}
for (const file of (fs.existsSync(drafts) ? fs.readdirSync(drafts) : []).filter((name) => /^[\w-]+-\d+\.json$/u.test(name)).sort()) {
  const draft = JSON.parse(fs.readFileSync(path.join(drafts, file), "utf8"));
  assert.ok(catalogs.has(draft.locale), `Unknown locale ${draft.locale}`);
  assert.equal(draft.sources.length, draft.translations.length, `Wrong translation count ${file}`);
  assert.equal(draft.invalidIds?.length ?? 0, 0, `Invalid translation IDs ${file}`);
  draft.sources.forEach((key, index) => {
    const repair = repairs.get(`${file}:${index}`);
    if (repair) assert.equal(repair.source, key, `Repair/source mismatch ${file}:${index}`);
    const translated = repair?.translation ?? draft.translations[index];
    assert.equal(typeof translated, "string", `Missing translation ${file}:${index}`);
    assert.ok(translated.trim(), `Empty translation ${file}:${index}`);
    assert.deepEqual(placeholders(translated), placeholders(key), `Placeholder mismatch ${file}:${index}`);
    catalogs.get(draft.locale).set(key, translated);
  });
}
for (const key of source.sources) {
  if (/[À-ÖØ-öø-ž\u1ea0-\u1ef9]/u.test(key)) catalogs.get("vi").set(key, key);
}
const missing = Object.fromEntries(codes.map((code) => [code, source.sources.filter((key) => !catalogs.get(code).has(key)
  || (code === "en" && /[À-ÖØ-öø-ž\u1ea0-\u1ef9]/u.test(key) && catalogs.get(code).get(key) === key))]));
if (process.argv.includes("--report-missing")) {
  console.log(JSON.stringify(missing));
  process.exit(0);
}
assert.equal(Object.values(missing).flat().length, 0, `INCOMPLETE_INTERFACE_CATALOG: ${JSON.stringify(missing)}`);
for (const code of codes) {
  const catalog = catalogs.get(code);
  for (const key of source.sources) {
    assert.ok(catalog.has(key), `Missing ${code}: ${key}`);
    assert.deepEqual(placeholders(catalog.get(key)), placeholders(key), `Placeholder mismatch ${code}: ${key}`);
  }
}
fs.mkdirSync(output, { recursive: true });
for (const code of codes) {
  const catalog = catalogs.get(code);
  fs.writeFileSync(path.join(output, `${code}.json`), JSON.stringify(Object.fromEntries(source.sources.map((key) => [key, displayBrand(catalog.get(key))])), null, 2) + "\n");
}
fs.writeFileSync(path.join(output, "aliases.json"), JSON.stringify(source.aliases, null, 2) + "\n");
console.log(JSON.stringify({ locales: codes.length, messagesPerLocale: source.sources.length, placeholders: "passed" }));
