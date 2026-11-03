import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../../artifacts/telecampaign/src/pages/accounts.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("accounts.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
assert.equal(ast.parseDiagnostics.length, 0);
const catalog = ast.statements.find(node => ts.isVariableStatement(node) &&
  node.declarationList.declarations.some(declaration => declaration.name.getText(ast) === "copy"));
const notice = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "ConnectionPrivacyNotice");
assert.ok(catalog && notice);
const compiled = ts.transpileModule(`${catalog.getText(ast)}\n${notice.getText(ast)}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText;
const React = { createElement: (type, props, ...children) => ({ type, props, children: children.flat() }) };
const fixture = vm.runInNewContext(`${compiled}\n({ copy, ConnectionPrivacyNotice })`, {
  React, ShieldCheck: () => null,
});
const textOf = node => typeof node === "string" ? node : node?.children?.map(textOf).join(" ") ?? "";

for (const language of ["vi", "en"]) {
  test(`connection explanation renders all accurate disclosures in ${language}`, () => {
    const rendered = fixture.ConnectionPrivacyNotice({ language });
    assert.equal(rendered.props.role, "note");
    assert.equal(rendered.props["data-testid"], "telegram-connection-privacy");
    const text = textOf(rendered);
    for (const key of ["connectionPrivacyTitle", "connectionPrivacyPurpose", "connectionPrivacyPassword", "connectionPrivacySession", "connectionPrivacyRevoke"]) {
      assert.ok(text.includes(fixture.copy[language][key]), key);
    }
    assert.match(text, language === "vi" ? /không lưu mật khẩu/ : /does not store your Telegram/);
    assert.match(text, language === "vi" ? /Cài đặt → Thiết bị/ : /Settings → Devices/);
    assert.doesNotMatch(text, /100%|an toàn tuyệt đối|completely safe|never.*banned/i);
  });
}

test("notice appears before both account-method selection and every login step", () => {
  assert.equal((source.match(/<ConnectionPrivacyNotice language=\{language\} \/>/g) ?? []).length, 2);
  assert.match(source, /testId="telegram-accounts-add-dialog">\s*<ConnectionPrivacyNotice language=\{language\} \/>\s*\{addMethod/);
  assert.match(source, /testId="telegram-accounts-login-dialog"\s*>\s*<ConnectionPrivacyNotice language=\{language\} \/>\s*\{loginFlow\.step/);
  assert.doesNotMatch(notice.getText(ast), /onClick|onSubmit|fetch\(|localStorage|sessionStorage|useEffect/);
});
