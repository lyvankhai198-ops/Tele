// Offline only: actual hook/action code with controlled browser/React adapters.
// No credentials, Telegram, real users, HTTP calls or chat mutations.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";
import * as link from "../../artifacts/telecampaign/src/lib/support-chat-link.ts";

const root = new URL("../../artifacts/telecampaign/src/", import.meta.url);
const hookSource = await readFile(new URL("lib/use-support-chat-link.ts", root), "utf8");
const widgetSource = await readFile(new URL("components/support-chat-widget.tsx", root), "utf8");
const popupSource = await readFile(new URL("components/AnnouncementPopup.tsx", root), "utf8");
function browser(href = "https://tele.khaimmo.shop/dashboard") {
  const target = new EventTarget();
  target.location = new URL(href);
  target.replacements = [];
  target.history = { state: { existing: true }, replaceState(state, title, path) {
    this.state = state;
    target.replacements.push(path);
    target.location = new URL(path, target.location);
  } };
  return target;
}
async function fixture(href) {
  const window = browser(href), refs = [];
  let cursor = 0, cleanup, effect, opened = 0;
  const onOpen = () => { opened++; };
  const context = vm.createContext({ window, URL, URLSearchParams, Event });
  function synthetic(names, values) {
    return new vm.SyntheticModule(names, function() {
      for (const name of names) this.setExport(name, values[name]);
    }, { context });
  }
  const react = synthetic(["useRef", "useEffect"], {
    useRef: value => refs[cursor++] ??= { current: value },
    useEffect: fn => { effect = fn; },
  });
  const wouter = synthetic(["useSearch"], { useSearch: () => window.location.search });
  const helpers = synthetic(["consumeSupportChatOpenIntent", "hasSupportChatOpenIntent", "requestSupportChatOpen", "SUPPORT_CHAT_OPEN_EVENT"], {
    consumeSupportChatOpenIntent: () => link.consumeSupportChatOpenIntent(window),
    hasSupportChatOpenIntent: link.hasSupportChatOpenIntent,
    requestSupportChatOpen: () => link.requestSupportChatOpen(window),
    SUPPORT_CHAT_OPEN_EVENT: link.SUPPORT_CHAT_OPEN_EVENT,
  });
  const module = new vm.SourceTextModule(stripTypeScriptTypes(hookSource, { mode: "transform" }), { context });
  await module.link(specifier => specifier === "react" ? react : specifier === "wouter" ? wouter : helpers);
  await module.evaluate();
  return {
    window, opened: () => opened,
    render(props) {
      cursor = 0;
      module.namespace.useSupportChatLink({ onOpen, ...props });
      cleanup?.(); cleanup = effect();
    },
    unmount() { cleanup?.(); },
  };
}
test("support links recognize only this website's explicit chat=open intent", () => {
  for (const href of ["/dashboard?chat=open", "https://tele.khaimmo.shop/dashboard?source=popup&chat=open"]) {
    assert.equal(link.isSupportChatOpenLink(href, "https://tele.khaimmo.shop"), true);
  }
  for (const href of ["/upgrade", "/dashboard?chat=closed", "https://evil.example/dashboard?chat=open",
    "//evil.example/?chat=open", "javascript:alert(1)", "https://"]) {
    assert.equal(link.isSupportChatOpenLink(href, "https://tele.khaimmo.shop"), false);
  }
});
test("consuming a link preserves other query parameters, base path, fragment and history state", () => {
  const window = browser("https://tele.khaimmo.shop/app/dashboard?chat=open&source=popup#section");
  const state = window.history.state;
  link.consumeSupportChatOpenIntent(window);
  assert.equal(window.location.href, "https://tele.khaimmo.shop/app/dashboard?source=popup#section");
  assert.equal(window.history.state, state);
  link.consumeSupportChatOpenIntent(window);
  assert.equal(window.replacements.length, 1);
});
test("direct link waits for auth/settings and survives an intervening workspace redirect", async () => {
  const f = await fixture("https://tele.khaimmo.shop/dashboard?chat=open");
  f.render({ user: null, ready: false, enabled: false });
  f.window.location = new URL("https://tele.khaimmo.shop/upgrade");
  f.render({ user: { id: "customer" }, ready: false, enabled: false });
  assert.equal(f.opened(), 0);
  f.render({ user: { id: "customer" }, ready: true, enabled: true });
  assert.equal(f.opened(), 1);
  f.render({ user: { id: "customer" }, ready: true, enabled: true });
  assert.equal(f.opened(), 1);
  f.unmount();
});
test("query-only navigation opens once and consumes chat=open without leaving the page", async () => {
  const f = await fixture();
  const props = { user: { id: "customer" }, ready: true, enabled: true };
  f.render(props);
  let popupDismissRequests=0;
  f.window.addEventListener(link.SUPPORT_CHAT_OPEN_EVENT,()=>{popupDismissRequests++;});
  f.window.location.search = "?chat=open&source=popup";
  f.render(props);
  assert.equal(f.opened(), 1);
  assert.equal(popupDismissRequests,1);
  assert.equal(f.window.location.pathname, "/dashboard");
  assert.equal(f.window.location.search, "?source=popup");
  f.render(props);
  assert.equal(f.opened(), 1);
  f.unmount();
});
test("popup open request is queued until settings load; listener is removed on unmount", async () => {
  const f = await fixture();
  f.render({ user: { id: "customer" }, ready: false, enabled: false });
  link.requestSupportChatOpen(f.window);
  assert.equal(f.opened(), 0);
  f.render({ user: { id: "customer" }, ready: true, enabled: true });
  assert.equal(f.opened(), 1);
  f.unmount();
  link.requestSupportChatOpen(f.window);
  assert.equal(f.opened(), 1);
});
test("disabled chat and non-customer roles cannot bypass the existing eligibility checks", async () => {
  const f = await fixture("https://tele.khaimmo.shop/dashboard?chat=open");
  f.render({ user: { id: "ineligible" }, ready: true, enabled: false });
  assert.equal(f.opened(), 0);
  assert.equal(f.window.location.search, "");
  link.requestSupportChatOpen(f.window);
  assert.equal(f.opened(), 0);
  f.render({ user: { id: "ineligible" }, ready: true, enabled: true });
  assert.equal(f.opened(), 0);
  f.unmount();
});
test("a pending request is not transferred to a different signed-in account", async () => {
  const f = await fixture();
  f.render({ user: { id: "first" }, ready: false, enabled: false });
  link.requestSupportChatOpen(f.window);
  f.render({ user: { id: "second" }, ready: true, enabled: true });
  assert.equal(f.opened(), 0);
  f.unmount();
});
test("the widget's actual link-open callback only reveals the existing chat, preserving drafts/messages", () => {
  const start = widgetSource.indexOf("const openFromLink = useCallback("), endToken = "  }, []);";
  assert.ok(start >= 0);
  const source = widgetSource.slice(start, widgetSource.indexOf(endToken, start) + endToken.length);
  const conversation = { id: "existing-session", messages: ["existing message"] };
  const state = { open: false, hidden: true, closeConfirm: true, draft: "unsent", conversation };
  const removed = [];
  const open = vm.runInNewContext(stripTypeScriptTypes(source, { mode: "transform" }) + "\nopenFromLink;", {
    useCallback: fn => fn, window: { localStorage: { removeItem: key => removed.push(key) } },
    setHidden: value => { state.hidden = value; },
    setCloseConfirmOpen: value => { state.closeConfirm = value; },
    setOpen: value => { state.open = value; },
  });
  open();
  assert.equal(state.open, true);
  assert.equal(state.hidden, false);
  assert.equal(state.closeConfirm, false);
  assert.equal(state.draft, "unsent");
  assert.equal(state.conversation, conversation);
  assert.deepEqual(removed, ["telecampaign-support-chat-hidden"]);
});
test("actual widget eligibility waits for settings, respects disabled chat and still permits its error UI", () => {
  const start=widgetSource.indexOf("  useSupportChatLink({");
  const end=widgetSource.indexOf("\n  });",start)+"\n  });".length;
  const source=widgetSource.slice(start,end);
  for(const scenario of [
    {data:undefined,isError:false,eligible:true,ready:false,enabled:true},
    {data:undefined,isError:true,eligible:true,ready:true,enabled:true},
    {data:{enabled:false},isError:false,eligible:true,ready:true,enabled:false},
    {data:{enabled:true},isError:false,eligible:false,ready:true,enabled:false},
  ]){
    let args;
    vm.runInNewContext(source,{
      useSupportChatLink:value=>{args=value;},user:{id:"fixture"},
      chatEnabled:scenario.eligible,chat:{data:scenario.data,isError:scenario.isError},openFromLink:()=>{},
    });
    assert.equal(args.ready,scenario.ready);
    assert.equal(args.enabled,scenario.enabled);
  }
});
function popupClick(href, preview = false) {
  const start = popupSource.indexOf("onClick={e => {") + "onClick={".length;
  const endToken = "\n            }";
  const end = popupSource.indexOf("\n            }}>", start) + endToken.length;
  assert.ok(start > 0 && end > start);
  const actions = [];
  const click = vm.runInNewContext("const click = " + popupSource.slice(start, end) + ";\nclick;", {
    popup: { linkUrl: href }, preview, window: { location: { origin: "https://tele.khaimmo.shop" } },
    close: () => actions.push("close"), navigate: url => actions.push("navigate:" + url),
    requestSupportChatOpen: () => actions.push("open-chat"), isSupportChatOpenLink: link.isSupportChatOpenLink,
  });
  click({ preventDefault: () => actions.push("prevent") });
  return actions;
}
test("the actual popup action closes then opens chat in place for internal and same-site absolute links", () => {
  for (const href of ["/dashboard?chat=open", "https://tele.khaimmo.shop/dashboard?chat=open"]) {
    assert.deepEqual(popupClick(href), ["prevent", "close", "open-chat"]);
  }
});
test("popup preview has no side effects and ordinary internal/external links retain their behavior", () => {
  assert.deepEqual(popupClick("/dashboard?chat=open", true), ["prevent"]);
  assert.deepEqual(popupClick("/upgrade"), ["close", "prevent", "navigate:/upgrade"]);
  assert.deepEqual(popupClick("https://external.example/"), ["close"]);
});
test("an in-flight popup response cannot cover a chat explicitly opened by the customer", () => {
  const start = popupSource.indexOf("const show = () => {"), endToken = "\n          };";
  const source = popupSource.slice(start, popupSource.indexOf(endToken, start) + endToken.length);
  let displayed = false;
  const show = vm.runInNewContext(source + "\nshow;", {
    cancelled: false, supportRequested: { current: true }, result: { popup: { id: "popup" } },
    setPopup: () => { displayed = true; },
  });
  show();
  assert.equal(displayed, false);
});
