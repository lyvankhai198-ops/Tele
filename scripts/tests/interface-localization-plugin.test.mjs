import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import plugin from "../interface-localization-plugin.mjs";

const require = createRequire(import.meta.url);
let babel;
try { babel = require("@babel/core"); }
catch {
  try {
    const artifact = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../artifacts/telecampaign");
    babel = createRequire(require.resolve("@vitejs/plugin-react", { paths: [artifact] }))("@babel/core");
  } catch {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
    const store = path.join(root, "node_modules/.pnpm");
    const match = fs.readdirSync(store).find((entry) => entry.startsWith("@babel+core@"));
    babel = require(path.join(store, match, "node_modules/@babel/core"));
  }
}
function compile(source) {
  const catalog = [], unresolved = [];
  const output = babel.transformSync(source, {
    filename: "/project/artifacts/telecampaign/src/pages/example.tsx",
    configFile: false, babelrc: false,
    parserOpts: { sourceType: "module", plugins: ["typescript", "jsx"] },
    plugins: [[plugin, { collect: (item) => catalog.push(item), unresolved: (item) => unresolved.push(item) }]],
  }).code;
  return { output, catalog, unresolved };
}

test("localizes presentation text while preserving customer values, IDs, payload values and CSS", () => {
  const { output, catalog } = compile(`function Page({ campaign, language }) {
    const payload = { status: "completed", accountId: campaign.accountId };
    return <section className="bg-white text-blue-500" data-testid="campaigns">
      <h1>Campaigns</h1><input placeholder="Find campaign" value={campaign.name}/>
      <button title="Delete campaign">{language === "vi" ? "Xoá chiến dịch" : "Delete campaign"}</button>
      <span>{campaign.name}</span><a href="/campaigns">View campaigns</a>
    </section>;
  }`);
  assert.ok(catalog.some((entry) => entry.source === "Campaigns"));
  assert.ok(catalog.some((entry) => entry.source === "Find campaign"));
  assert.ok(catalog.some((entry) => entry.source === "Delete campaign" && entry.vi === "Xoá chiến dịch"));
  assert.match(output, /status: "completed"/u);
  assert.match(output, /className="bg-white text-blue-500"/u);
  assert.match(output, /value=\{campaign.name\}/u);
  assert.match(output, /<span>\{campaign.name\}<\/span>/u);
  assert.match(output, /href="\/campaigns"/u);
  assert.ok(!catalog.some((entry) => ["completed", "campaigns", "/campaigns", "bg-white text-blue-500"].includes(entry.source)));
});

test("template placeholders preserve values and do not turn customer values into translation keys", () => {
  const { output, catalog } = compile("function Page({ language, count, customer }) { return <p>{language === 'vi' ? `Đã chọn ${count} của ${customer}` : `Selected ${count} for ${customer}`}</p>; }");
  assert.ok(catalog.some((entry) => entry.source === "Selected {{0}} for {{1}}" && entry.vi === "Đã chọn {{0}} của {{1}}"));
  assert.match(output, /"0": count/u);
  assert.match(output, /"1": customer/u);
});

test("context components localize static JSX without inventing a language binding or changing DOM layout", () => {
  const { output, catalog } = compile('function Header(){ return <header><h1>Account settings</h1><input aria-label="Search accounts"/></header>; }');
  assert.match(output, /InterfaceText/u);
  assert.match(output, /InterfaceAttributes/u);
  assert.ok(catalog.some((entry) => entry.source === "Account settings"));
  assert.ok(catalog.some((entry) => entry.source === "Search accounts"));
  assert.doesNotMatch(output, /\blanguage\b/u);
});

test("locale formatting uses the actual selected language and CSS branches stay untouched", () => {
  const { output, catalog } = compile(`function Page({language}) {
    const date = new Date().toLocaleDateString(language === "vi" ? "vi-VN" : "en-US");
    return <p className={language === "vi" ? "bg-white text-red-500" : "bg-blue-500 text-white"}>{date}</p>;
  }`);
  assert.match(output, /toLocaleDateString\(language\)/u);
  assert.equal(catalog.length, 0);
  assert.match(output, /language === "vi" \? "bg-white text-red-500" : "bg-blue-500 text-white"/u);
});

test("the actual release-date helper keeps Intl enums valid after localization", () => {
  const page = fs.readFileSync(new URL("../../artifacts/telecampaign/src/pages/admin-release-updates.tsx", import.meta.url), "utf8");
  const helper = page.match(/function dateLabel\([\s\S]*?\n\}/u)?.[0];
  assert.ok(helper, "actual release date helper must be exercised");
  const { output, catalog } = compile(helper.replace(/: string/gu, ""));
  assert.equal(catalog.length, 0);
  assert.doesNotMatch(output, /interfaceText/u);
  assert.match(output, /dateStyle: "medium"/u);
  assert.match(output, /timeStyle: "short"/u);
  const dateLabel = new Function(`${output}; return dateLabel;`)();
  for (const language of ["vi", "en", "bn", "ur", "ar", "ja"]) {
    assert.equal(typeof dateLabel("2026-11-05T00:00:00.000Z", language), "string");
  }
});

test("Intl and toLocale options stay technical while visible short/medium labels translate", () => {
  const { output, catalog } = compile(`function amountLabel(value, language) {
    return new Intl.NumberFormat(language, { notation: "compact", compactDisplay: "short" }).format(value);
  }
  function dateLabel(value, language) {
    return new Date(value).toLocaleString(language === "vi" ? "vi-VN" : "en-GB",
      { dateStyle: language === "vi" ? "medium" : "medium", timeStyle: "short" });
  }`);
  assert.equal(catalog.length, 0);
  assert.doesNotMatch(output, /interfaceText/u);
  const helpers = new Function(`${output}; return {amountLabel,dateLabel};`)();
  for (const language of ["vi", "en", "bn", "ur"]) {
    assert.equal(typeof helpers.amountLabel(12000, language), "string");
    assert.equal(typeof helpers.dateLabel("2026-11-05T00:00:00.000Z", language), "string");
  }
  const visible = compile('function Page({language}) { return <p>{language === "vi" ? "Ngắn" : "short"} medium</p>; }');
  assert.ok(visible.catalog.some(entry => entry.source === "short"));
  assert.ok(visible.catalog.some(entry => entry.source.trim() === "medium"));
});

test("different interpolation expressions require explicit review, never silently swap values", () => {
  const { unresolved, catalog } = compile("function Page({language,left,right}) { return <p>{language === 'vi' ? `Nhóm ${left}` : `Group ${right}`}</p>; }");
  assert.equal(unresolved.length, 1);
  assert.equal(unresolved[0].reason, "different-template-values");
  assert.ok(!catalog.some((entry) => entry.vi === "Nhóm {{0}}"));
});

test("legacy UI dictionaries and optional labels use the full context language", () => {
  const { output } = compile(`function Page({language,copy,labels,status}) {
    const c = copy[language === "vi" ? "vi" : "en"];
    return <p>{c.title}{labels[status]?.[language === "vi" ? "vi" : "en"] ?? status}</p>;
  }`);
  assert.match(output, /interfaceCopy.*from "@\/lib\/interface-runtime"/u);
  assert.match(output, /interfaceCopy\(copy, language\)/u);
  assert.match(output, /interfaceCopy\(labels\[status\], language\)/u);
  assert.match(output, /\?\? status/u);
});

test("legacy reason-label tuples use selected language without changing reason codes", () => {
  const { output } = compile(`function reason(code, language) {
    const labels = { uncertain: ["Chưa xác minh", "Unverified"] };
    return labels[code]?.[language === "vi" ? 0 : 1] ?? code;
  }`);
  assert.match(output, /interfacePair\(labels\[code\], language\)/u);
  assert.match(output, /\?\? code/u);
});

test("English-first copy, conditional UI labels and display helpers are localized without translating returned data", () => {
  const { output } = compile(`function statusLabel(ready, language, record) {
    if (ready) return "Đã sẵn sàng";
    return record.name;
  }
  function Page({language,ready,record}) {
    return <><p>{language === "en" ? "Welcome" : "Chào mừng"}</p>
      <label>{ready ? "Sẵn sàng" : "Đang chờ"}</label><input type="email"/><textarea value={record.message}/></>;
  }`);
  assert.match(output, /interfaceText\("Welcome", language/u);
  const literal = output.match(/if \(ready\) return _interfaceText\(("(?:\\.|[^"])*"), language/u)?.[1];
  assert.ok(literal);
  assert.equal(babel.parseSync(`const label = ${literal}`, { configFile: false, babelrc: false }).program.body[0].declarations[0].init.value, "Đã sẵn sàng");
  assert.match(output, /return record\.name/u);
  assert.match(output, /dir="ltr"/u);
  assert.match(output, /dir="auto"/u);
});
