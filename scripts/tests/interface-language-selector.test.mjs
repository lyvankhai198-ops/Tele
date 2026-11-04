import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let ts;
try { ts = require("typescript"); }
catch { ts = require(path.resolve(root, "../../node_modules/.pnpm/typescript@5.9.3/node_modules/typescript")); }
function compile(file, dependencies) {
  const exports = {};
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(output, { exports, require: dependencies }, { filename: file });
  return exports;
}
const locales = compile(path.join(root, "artifacts/telecampaign/src/lib/locales.ts"), () => { throw Error("Unexpected registry dependency"); });
const catalogPath = path.join(root, "artifacts/telecampaign/src/lib/locale-catalogs");
const catalogs = new Map();
const text = (source, language) => {
  if (!catalogs.has(language)) catalogs.set(language, JSON.parse(fs.readFileSync(path.join(catalogPath, `${language}.json`), "utf8")));
  const translated = catalogs.get(language)[source];
  assert.equal(typeof translated, "string", `Missing picker label: ${language}/${source}`);
  return translated;
};
function harness(initialLanguage, options = {}) {
  const states = [], refs = [];
  let stateIndex = 0, refIndex = 0, selectedLanguage = initialLanguage;
  const choices = [];
  const react = {
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (next) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
    },
    useRef(initial) { const index = refIndex++; return refs[index] ??= { current: initial }; },
    useId: () => "locale-test",
    useEffect: () => {},
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const module = compile(path.join(root, "artifacts/telecampaign/src/components/LanguageSelector.tsx"), (name) => {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
    if (name === "lucide-react") return { Check: "check", ChevronDown: "chevron", Search: "search" };
    if (name.endsWith("/locales")) return locales;
    if (name.endsWith("/interface-runtime")) return { interfaceText: text };
    throw Error(`Unexpected selector dependency: ${name}`);
  });
  const render = () => {
    stateIndex = 0; refIndex = 0;
    return module.LanguageSelector({ language: selectedLanguage, onChange: (language) => { choices.push(language); selectedLanguage = language; }, ...options });
  };
  function find(node, predicate) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap((child) => find(child, predicate));
    return [...(predicate(node) ? [node] : []), ...find(node.props?.children, predicate)];
  }
  return { render, find, choices };
}
const byRole = (role) => (node) => node.props?.role === role;
const event = (key, ctrlKey = false) => ({ key, ctrlKey, preventDefault() {}, stopPropagation() {} });

test("all 22 selectors render native accessible labels and keep the existing control position", () => {
  for (const locale of locales.interfaceLocales) {
    const h = harness(locale.code, { placement: "top" });
    let tree = h.render();
    const trigger = h.find(tree, (node) => node.type === "button")[0];
    assert.ok(trigger.props["aria-label"]);
    trigger.props.onClick();
    tree = h.render();
    assert.equal(h.find(tree, byRole("option")).length, 22);
    assert.equal(h.find(tree, byRole("option")).filter((node) => node.props["aria-selected"]).length, 1);
    assert.match(h.find(tree, byRole("dialog"))[0].props.className, /bottom-/u);
    assert.match(h.find(tree, byRole("listbox"))[0].props.className, /overflow-y-auto/u);
  }
});

test("country search selects Bengali once and closes the picker", () => {
  const h = harness("vi");
  h.find(h.render(), (node) => node.type === "button")[0].props.onClick();
  let tree = h.render();
  h.find(tree, byRole("combobox"))[0].props.onChange({ target: { value: "Bangladesh" } });
  tree = h.render();
  assert.equal(h.find(tree, byRole("option")).length, 1);
  h.find(tree, byRole("option"))[0].props.onClick();
  assert.deepEqual(h.choices, ["bn"]);
  assert.equal(h.find(h.render(), byRole("dialog")).length, 0);
});

test("search accepts the Arabic name of Japanese and Escape closes without selecting", () => {
  const h = harness("ar");
  h.find(h.render(), (node) => node.type === "button")[0].props.onClick();
  h.find(h.render(), byRole("combobox"))[0].props.onChange({ target: { value: text("Japanese", "ar") } });
  let tree = h.render();
  assert.equal(h.find(tree, byRole("option")).length, 1);
  h.find(tree, byRole("dialog"))[0].props.onKeyDown(event("Escape"));
  assert.equal(h.find(h.render(), byRole("dialog")).length, 0);
  assert.deepEqual(h.choices, []);
});

test("keyboard End and Enter choose the last locale without changing page layout", () => {
  const h = harness("en");
  h.find(h.render(), (node) => node.type === "button")[0].props.onClick();
  h.find(h.render(), byRole("combobox"))[0].props.onKeyDown(event("End", true));
  h.find(h.render(), byRole("combobox"))[0].props.onKeyDown(event("Enter"));
  assert.deepEqual(h.choices, [locales.interfaceLocales.at(-1).code]);
  assert.equal(h.find(h.render(), byRole("dialog")).length, 0);
});
