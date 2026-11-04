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

test("sidebar dropdown stays within its trigger while compact auth picker retains viewport bounds", () => {
  for (const compact of [false, true]) {
    const h = harness("vi", { placement: "top", compact });
    h.find(h.render(), (node) => node.type === "button")[0].props.onClick();
    const dialog = h.find(h.render(), byRole("dialog"))[0];
    assert.match(dialog.props.className, compact ? /max-w-\[calc\(100vw-2rem\)\]/u : /w-full max-w-full/u);
    if (!compact) assert.doesNotMatch(dialog.props.className, /19rem/u);
  }
  const layout = fs.readFileSync(path.join(root, "artifacts/telecampaign/src/components/layout/AppLayout.tsx"), "utf8");
  assert.match(layout, /min-w-0 truncate[^"]*lg:hidden">Campaign Manager/u);
});

function adminScopeHarness(role = "admin") {
  const file = path.join(root, "artifacts/telecampaign/src/App.tsx");
  const ast = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "AdminLanguageScope");
  assert.ok(declaration);
  const output = ts.transpileModule(`export ${declaration.getText(ast)}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {}, states = [], effectDeps = [], queue = [];
  const parent = { language: "bn", setLanguage: () => { throw Error("ADMIN_MUST_NOT_WRITE_ACCOUNT_PREFERENCE"); } };
  let stateIndex = 0, effectIndex = 0, location = "/admin";
  const user = { id: "fixture-admin", role };
  vm.runInNewContext(output, {
    exports, require: () => ({ jsx: (type, props) => ({ type, props }) }),
    useAuth: () => ({ user }), useLanguage: () => parent, useLocation: () => [location],
    LanguageOverride: "language-override",
    useState(initial) {
      const i = stateIndex++;
      if (!(i in states)) states[i] = initial;
      return [states[i], (value) => { states[i] = typeof value === "function" ? value(states[i]) : value; }];
    },
    useEffect(callback, deps) {
      const i = effectIndex++;
      if (!effectDeps[i] || deps.some((value, index) => value !== effectDeps[i][index])) queue.push(callback);
      effectDeps[i] = deps;
    },
  });
  return {
    parent, user,
    render(route = location) {
      location = route; stateIndex = 0; effectIndex = 0;
      const result = exports.AdminLanguageScope({ children: "unchanged-content" });
      queue.splice(0).forEach((callback) => callback());
      return result;
    },
  };
}

test("admin defaults to Vietnamese without changing the customer's saved language", () => {
  const h = adminScopeHarness();
  assert.equal(h.render().props.language, "vi");
  h.render().props.setLanguage("en");
  assert.equal(h.render("/admin/tools").props.language, "en");
  assert.equal(h.parent.language, "bn");
  assert.equal(h.render("/dashboard"), "unchanged-content");
  h.user.id = "another-fixture-admin"; h.render("/admin");
  assert.equal(h.render().props.language, "vi");
  assert.equal(h.parent.language, "bn");
});

test("admin override never applies to customer surfaces or customer feedback", () => {
  const h = adminScopeHarness("user");
  assert.equal(h.render("/dashboard/feedback"), "unchanged-content");
  assert.equal(h.parent.language, "bn");
  const admin = adminScopeHarness();
  assert.equal(admin.render("/dashboard/feedback").props.language, "vi");
  assert.equal(admin.render("/dashboard/campaigns"), "unchanged-content");
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
