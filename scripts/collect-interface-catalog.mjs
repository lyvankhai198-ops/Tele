import fs from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import interfaceLocalizationPlugin from "./interface-localization-plugin.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
function dependency(name, fallback) {
  try { return require(name); }
  catch {
    try {
      const reactPlugin = require.resolve("@vitejs/plugin-react", { paths: [path.join(root, "artifacts/telecampaign")] });
      return createRequire(reactPlugin)(name);
    } catch { /* Standalone authoring tools may use the workspace store. */ }
    const parent = path.resolve(root, "../..", "node_modules/.pnpm");
    const match = fs.readdirSync(parent).find((entry) => entry.startsWith(fallback));
    if (!match) throw new Error(`Missing catalog tool: ${name}`);
    return require(path.join(parent, match, "node_modules", name));
  }
}
const babel = dependency("@babel/core", "@babel+core@");
const ts = dependency("typescript", "typescript@");
const sourceRoot = path.join(root, "artifacts/telecampaign/src");
const sources = new Map(), aliases = new Map(), unresolved = [];
function register(source, vi) {
  if (!source.trim()) return;
  sources.set(source.trim(), source.trim());
  if (vi) aliases.set(vi.trim(), source.trim());
}
// The existing canonical English catalog and explicit VI/EN pairs are source
// material, not executable input. Read only literal AST properties.
for (const name of ["lib/feedback-i18n.ts", "lib/i18n.tsx"]) {
  const file = path.join(sourceRoot, name);
  const ast = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name) && ts.isStringLiteral(node.initializer)) {
      register(node.name.text, node.initializer.text);
    }
    if (ts.isObjectLiteralExpression(node)) {
      const values = new Map(node.properties.filter(ts.isPropertyAssignment).map((property) => [
        property.name.getText(ast).replace(/^["']|["']$/gu, ""), property.initializer,
      ]));
      if (values.has("en") && values.has("vi") && ts.isStringLiteral(values.get("en")) && ts.isStringLiteral(values.get("vi"))) {
        register(values.get("en").text, values.get("vi").text);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
let files = 0;
function visitDirectory(directory) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) visitDirectory(file);
    else if (/\.[jt]sx?$/u.test(item.name)) {
      files++;
      babel.transformSync(fs.readFileSync(file, "utf8"), {
        filename: file, configFile: false, babelrc: false,
        parserOpts: { sourceType: "module", plugins: ["typescript", "jsx"] },
        plugins: [[interfaceLocalizationPlugin, {
          collect: ({ source, vi }) => register(source, vi),
          unresolved: (item) => unresolved.push({ ...item, file: path.relative(root, item.file) }),
        }]],
      });
    }
  }
}
visitDirectory(sourceRoot);
const localesAst = ts.createSourceFile("locales.ts", fs.readFileSync(path.join(sourceRoot, "lib/locales.ts"), "utf8"), ts.ScriptTarget.Latest, true);
function collectLocaleNames(node) {
  if (ts.isPropertyAssignment(node) && node.name.getText(localesAst) === "english" && ts.isStringLiteral(node.initializer)) register(node.initializer.text);
  ts.forEachChild(node, collectLocaleNames);
}
collectLocaleNames(localesAst);
// System-created web notifications are UI copy too. Never collect database
// records, customer messages or admin-authored announcements.
const serverRoot = path.join(root, "artifacts/api-server/src");
function collectServerNotifications(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { collectServerNotifications(file); continue; }
    if (!entry.name.endsWith(".ts")) continue;
    const ast = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    function literal(node) {
      if (ts.isStringLiteralLike(node)) return node.text;
      if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map((span, index) => `{{${index}}}${span.literal.text}`).join("");
      return null;
    }
    function alternatives(node) {
      if (ts.isConditionalExpression(node)) { alternatives(node.whenTrue); alternatives(node.whenFalse); return; }
      const text = literal(node);
      if (text) register(text);
    }
    function visit(node) {
      if (ts.isPropertyAssignment(node) && ["titleEn", "bodyEn"].includes(node.name.getText(ast).replace(/["']/gu, ""))) {
        alternatives(node.initializer);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
}
collectServerNotifications(serverRoot);
const catalog = [...sources.keys()].filter((key) => !aliases.has(key) || aliases.get(key) === key).sort();
const output = path.join(root, "scripts/interface-catalog-source.json");
const report = {
  sourceCommit: "327aa41deaf3b7f1c3c3138e4b5f7e79d3eb7fa7",
  files, sources: catalog,
  aliases: Object.fromEntries([...aliases].sort(([a], [b]) => a.localeCompare(b))),
  unresolved,
};
if (process.argv.includes("--check")) {
  assert.deepEqual(JSON.parse(fs.readFileSync(output, "utf8")), report, "INTERFACE_CATALOG_SOURCE_OUTDATED");
} else {
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
}
assert.equal(unresolved.length, 0, "INTERFACE_COPY_REQUIRES_EXPLICIT_REVIEW");
console.log(JSON.stringify({ files, sourceStrings: catalog.length, aliases: aliases.size, unresolved: unresolved.length, checked: process.argv.includes("--check") }));
