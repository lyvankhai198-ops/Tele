import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
let ts;
try { ts = require("typescript"); }
catch {
  const workspace = path.resolve(root, "../..");
  ts = require(path.join(workspace, "node_modules/.pnpm/typescript@5.9.3/node_modules/typescript"));
}
const file = path.join(root, "artifacts/telecampaign/src/lib/locales.ts");
const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const context = { exports: {} };
vm.runInNewContext(compiled.outputText, context, { filename: file });
const { interfaceLocales, isInterfaceLanguage, getInterfaceLocale, searchInterfaceLocales } = context.exports;

test("exactly 22 unique, validated interface languages including Pakistan and Bangladesh", () => {
  assert.equal(interfaceLocales.length, 22);
  assert.equal(new Set(interfaceLocales.map((locale) => locale.code)).size, 22);
  for (const locale of interfaceLocales) assert.equal(isInterfaceLanguage(locale.code), true);
  for (const value of [null, undefined, "", "constructor", "__proto__", "EN", {}, "en<script>"]) {
    assert.equal(isInterfaceLanguage(value), false);
  }
  assert.equal(getInterfaceLocale("ur").native, "اردو");
  assert.equal(getInterfaceLocale("bn").native, "বাংলা");
});

test("search accepts native language, country, aliases, unaccented Vietnamese and codes", () => {
  for (const [query, code] of [
    ["pakistan", "ur"], ["Pakistan Urdu", "ur"], ["Bangladesh", "bn"],
    ["bangla", "bn"], ["বাংলা", "bn"], ["اردو", "ur"], ["Han Quoc", "ko"],
    ["Ha Lan", "nl"], ["  NHẬT  ", "ja"], ["zh-Hant", "zh-Hant"], ["မြန်မာ", "my"],
  ]) assert.ok(searchInterfaceLocales(query).some((locale) => locale.code === code), query);
  assert.equal(searchInterfaceLocales("").length, 22);
  assert.equal(searchInterfaceLocales("not-a-language").length, 0);
  assert.equal(searchInterfaceLocales("Pakistan Bengali").length, 0);
});

test("only Arabic and Urdu use RTL; native names and flags remain available", () => {
  assert.deepEqual(Array.from(interfaceLocales.filter((locale) => locale.direction === "rtl"), (locale) => locale.code), ["ar", "ur"]);
  for (const locale of interfaceLocales) {
    assert.ok(locale.native.trim());
    assert.ok(locale.flag.trim());
    assert.ok(locale.country.trim());
  }
});

test("language search also matches names localized into the selected interface language", () => {
  assert.deepEqual(Array.from(searchInterfaceLocales("tiếng nhật", { ja: "Tiếng Nhật" }), (locale) => locale.code), ["ja"]);
  assert.deepEqual(Array.from(searchInterfaceLocales("জাপানি", { ja: "জাপানি" }), (locale) => locale.code), ["ja"]);
});
