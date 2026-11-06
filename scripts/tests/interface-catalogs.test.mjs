import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = path.join(root, "artifacts/telecampaign/src/lib");
let ts;
try { ts = require("typescript"); }
catch { ts = require(path.resolve(root, "../../node_modules/.pnpm/typescript@5.9.3/node_modules/typescript")); }
const source = JSON.parse(fs.readFileSync(path.join(root, "scripts/interface-catalog-source.json"), "utf8"));
const aliases = JSON.parse(fs.readFileSync(path.join(sourceRoot, "locale-catalogs/aliases.json"), "utf8"));
const modules = new Map(), loaderCalls = new Map();
const local = new Map(), session = new Map();
const storage = (data) => ({
  getItem: (key) => data.get(key) ?? null,
  setItem: (key, value) => data.set(key, value),
  removeItem: (key) => data.delete(key),
});
const glob = Object.fromEntries(fs.readdirSync(path.join(sourceRoot, "locale-catalogs"))
  .filter((file) => file.endsWith(".json") && !["aliases.json", "bootstrap.json"].includes(file))
  .map((file) => [`./locale-catalogs/${file}`, async () => {
    loaderCalls.set(file, (loaderCalls.get(file) ?? 0) + 1);
    return JSON.parse(fs.readFileSync(path.join(sourceRoot, "locale-catalogs", file), "utf8"));
  }]));

function load(name) {
  if (name.endsWith(".json")) return JSON.parse(fs.readFileSync(path.join(sourceRoot, name), "utf8"));
  if (modules.has(name)) return modules.get(name);
  const file = path.join(sourceRoot, `${name}.ts`);
  const exports = {};
  modules.set(name, exports);
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    transformers: { before: [(context) => {
      const visit = (node) => {
        if (ts.isCallExpression(node) && node.expression.getText() === "import.meta.glob") {
          return context.factory.createIdentifier("__catalogLoaders");
        }
        return ts.visitEachChild(node, visit, context);
      };
      return (node) => ts.visitNode(node, visit);
    }] },
  }).outputText;
  vm.runInNewContext(output, {
    exports, require: (dependency) => load(dependency.replace(/^\.\//u, "")),
    window: { localStorage: storage(local), sessionStorage: storage(session) },
    __catalogLoaders: glob, Intl, console,
  }, { filename: file });
  return exports;
}
const locales = load("locales");
const runtime = load("interface-runtime");
const placeholders = (value) => [...value.matchAll(/\{\{[^{}]+\}\}/gu)].map((match) => match[0]).sort();

test("real account copy renders finite and unlimited plan limits in every supported language", async () => {
  const page = fs.readFileSync(path.join(root, "artifacts/telecampaign/src/pages/account.tsx"), "utf8");
  const ast = ts.createSourceFile("account.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer;
  function find(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "copy") initializer = node.initializer;
    ts.forEachChild(node, find);
  }
  find(ast);
  assert.ok(initializer);
  const exports = {};
  vm.runInNewContext(ts.transpileModule(`const copy = ${initializer.getText(ast)}; exports.copy = copy;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports });
  for (const file of Object.keys(glob)) {
    const language = path.basename(file, ".json");
    await runtime.loadInterfaceCatalog(language);
    const copy = runtime.interfaceCopy(exports.copy, language);
    for (const limit of [null, 1, 2, 5, 10]) {
      assert.ok(copy.accountSlots(limit), `${language}: account limit ${limit}`);
    }
    assert.ok(copy.daysLabel(3), `${language}: remaining days`);
    assert.ok(copy.remainingOf("120"), `${language}: remaining resources`);
  }
});

test("admin active-groups page title is registered for the shared layout translator", async () => {
  const page = fs.readFileSync(path.join(root, "artifacts/telecampaign/src/pages/admin-active-groups.tsx"), "utf8");
  const title = page.match(/const text = \{\s*title: "([^"]+)"/u)?.[1];
  assert.ok(title, "Read the actual admin title passed to AppLayout");
  await runtime.loadInterfaceCatalog("vi");
  assert.equal(runtime.interfaceText(title, "vi"), "Thư viện nhóm");
});

test("all 22 catalogs cover the complete UI and retain every interpolation token", () => {
  for (const locale of locales.interfaceLocales) {
    const catalog = JSON.parse(fs.readFileSync(path.join(sourceRoot, "locale-catalogs", `${locale.code}.json`), "utf8"));
    assert.equal(Object.keys(catalog).length, source.sources.length, locale.code);
    for (const key of source.sources) {
      assert.equal(typeof catalog[key], "string", `${locale.code}: ${key}`);
      assert.ok(catalog[key].trim(), `${locale.code}: empty translation`);
      assert.deepEqual(placeholders(catalog[key]), placeholders(key), `${locale.code}: ${key}`);
      if (locale.code !== "vi" && /[À-ÖØ-öø-ž\u1ea0-\u1ef9]/u.test(key)) {
        assert.notEqual(catalog[key], key, `${locale.code}: untranslated Vietnamese interface text`);
      }
      if (!["en", "vi"].includes(locale.code) && key.length > 70 && /[a-z]{3,} [a-z]{3,} [a-z]{3,}/iu.test(key)) {
        assert.notEqual(catalog[key], key, `${locale.code}: untranslated sentence`);
      }
    }
  }
});

test("catalog loading is deduplicated and all registered source keys render", async () => {
  await Promise.all([runtime.loadInterfaceCatalog("bn"), runtime.loadInterfaceCatalog("bn")]);
  assert.equal(loaderCalls.get("bn.json"), 1);
  for (const locale of locales.interfaceLocales) {
    await runtime.loadInterfaceCatalog(locale.code);
    for (const key of source.sources) assert.equal(typeof runtime.interfaceText(key, locale.code), "string", `${locale.code}: ${key}`);
  }
});

test("dashboard renders API campaign statuses in all locales without changing transport data", async () => {
  const { campaignStatusSource } = load("campaign-status");
  const statuses = Object.freeze(["draft", "running", "paused", "completed", "failed", "scheduled"]);
  for (const { code } of locales.interfaceLocales) {
    await runtime.loadInterfaceCatalog(code);
    for (const status of statuses) {
      const label = campaignStatusSource(status);
      assert.notEqual(label, status);
      assert.equal(typeof runtime.interfaceText(label, code), "string");
    }
  }
  assert.equal(campaignStatusSource("constructor"), "—");
  assert.equal(campaignStatusSource("future_status"), "—");
  const dashboard = fs.readFileSync(path.join(sourceRoot, "../pages/dashboard.tsx"), "utf8");
  assert.match(dashboard, /t\(campaignStatusSource\(camp\.status\)\)/u);
  assert.doesNotMatch(dashboard, /t\(camp\.status\)/u);
});

test("nested page and layout translations accept the selected locale's existing labels", async () => {
  for (const { code } of locales.interfaceLocales) {
    await runtime.loadInterfaceCatalog(code);
    for (const label of ["Dashboard", "Running", "Completed", "Campaigns"]) {
      const displayed = runtime.interfaceText(label, code);
      assert.equal(runtime.interfaceText(displayed, code), displayed, `${code}: ${label}`);
    }
  }
});

test("authored notifications remain untouched but unknown system copy remains explicit", async () => {
  await runtime.loadInterfaceCatalog("bn");
  const authored = "Custom customer-facing announcement, not a system translation key.";
  assert.equal(runtime.interfaceSystemNotification(authored, "bn", true), authored);
  assert.throws(() => runtime.interfaceSystemNotification(authored, "bn", false), /MISSING_INTERFACE_TRANSLATION/u);
});

test("localized choices retain exact transport values, IDs and handlers", async () => {
  await runtime.loadInterfaceCatalog("bn");
  const handler = () => "unchanged";
  const value = { accountId: "constructor", status: "active" };
  const choice = { label: "Account", value, id: "customer-id", onSelect: handler };
  const translated = runtime.interfaceCopy({ vi: [choice], en: [choice] }, "bn");
  assert.equal(translated[0].label, runtime.interfaceText("Account", "bn"));
  assert.equal(translated[0].value, value);
  assert.equal(translated[0].id, "customer-id");
  assert.equal(translated[0].onSelect, handler);
  const statuses = runtime.interfaceCopy({ vi: [{ label: "Account", value: "active" }], en: [{ label: "Account", value: "active" }] }, "bn");
  assert.equal(statuses[0].value, "active");
});

test("English-only legacy dictionaries display selected native copy; unknown optional labels stay absent", async () => {
  await runtime.loadInterfaceCatalog("bn");
  const copy = {
    en: { heading: "Account", count: (n) => `${n} day${n === 1 ? "" : "s"}`, input: "https://example.com" },
    vi: { heading: "Tài khoản", count: (n) => `${n} ngày`, input: "https://example.com" },
  };
  const translated = runtime.interfaceCopy(copy, "bn");
  assert.equal(translated.heading, runtime.interfaceText("Account", "bn"));
  assert.equal(translated.count(3), new Intl.NumberFormat("bn", { style: "unit", unit: "day", unitDisplay: "long" }).format(3));
  assert.equal(translated.input, "https://example.com");
  assert.equal(runtime.interfaceCopy(copy, "vi").count(3), "3 ngày");
  assert.equal(runtime.interfaceCopy(undefined, "bn"), undefined);
});

test("interpolation preserves customer content literally and unknown application prose never silently falls back to English", async () => {
  await runtime.loadInterfaceCatalog("ur");
  const key = source.sources.find((item) => item.includes("{{0}}") && !item.includes("{{1}}"));
  const customer = "<script>alert('customer input')</script> & A/B";
  const result = runtime.interfaceText(key, "ur", { 0: customer });
  assert.ok(result.includes(customer));
  assert.throws(() => runtime.interfaceText("Unregistered internal interface prose.", "ur"), /MISSING_INTERFACE_TRANSLATION/u);
  assert.throws(() => runtime.interfaceText("constructor", "ur"), /MISSING_INTERFACE_TRANSLATION/u);
});

test("anonymous choice survives loading and can only be consumed for the expected selection", () => {
  runtime.rememberAnonymousInterfaceLanguage("bn");
  assert.equal(runtime.pendingAnonymousInterfaceLanguage(), "bn");
  runtime.clearAnonymousInterfaceLanguage("ur");
  assert.equal(runtime.pendingAnonymousInterfaceLanguage(), "bn");
  runtime.clearAnonymousInterfaceLanguage("bn");
  assert.equal(runtime.pendingAnonymousInterfaceLanguage(), null);
  local.set("telecampaign-language", "__proto__");
  assert.equal(runtime.readStoredInterfaceLanguage(), "en");
  local.set("telecampaign-language", "ur");
  assert.equal(runtime.readStoredInterfaceLanguage(), "ur");
});

test("bootstrap load and failure states are localized before the lazy catalog is available", () => {
  const bootstrap = JSON.parse(fs.readFileSync(path.join(sourceRoot, "locale-catalogs/bootstrap.json"), "utf8"));
  for (const locale of locales.interfaceLocales) {
    for (const field of ["loading", "error", "retry"]) assert.ok(bootstrap[locale.code][field].trim(), `${locale.code}:${field}`);
  }
  assert.equal(Object.keys(bootstrap).length, 22);
});
