import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { adminParentPath, isAdminPath, nextAdminEntry, validAdminEntry } from "../../artifacts/telecampaign/src/lib/admin-navigation.ts";
const owner = "fixture-admin";
const initial = path => nextAdminEntry({ owner, path, action: "initial" });
const push = (previous, path) => nextAdminEntry({ owner, path, action: "push", previous });

test("direct admin links have no assumed browser predecessor", () => {
  assert.equal(initial("/admin/license-keys").previous, null);
  assert.equal(initial("/admin/users/fixture/support").previous, null);
  assert.equal(adminParentPath("/admin/users/fixture/support?tab=keys"), "/admin/users");
  assert.equal(adminParentPath("/admin/license-keys"), "/admin");
});
test("back preserves the actual prior key inventory and its user filter", () => {
  const inventory = initial("/admin/license-keys?userId=fixture-customer");
  const profile = push(inventory, "/admin/users/fixture-customer/support");
  assert.equal(profile.previous, inventory.path);
  const back = nextAdminEntry({ owner, path: inventory.path, action: "pop", existing: inventory, previous: profile });
  assert.deepEqual(back, inventory);
});
test("back and forward retain each original predecessor without building loops", () => {
  const overview = initial("/admin");
  const users = push(overview, "/admin/users");
  const profile = push(users, "/admin/users/fixture/support");
  assert.equal(nextAdminEntry({ owner, path: users.path, action: "pop", existing: users, previous: profile }).previous, "/admin");
  assert.equal(nextAdminEntry({ owner, path: profile.path, action: "pop", existing: profile, previous: users }).previous, "/admin/users");
});
test("query-only navigation is a separate navigable step", () => {
  const first = initial("/admin/license-keys?keyId=first");
  const second = push(first, "/admin/license-keys?keyId=second");
  assert.equal(second.previous, first.path);
});
test("replace keeps the predecessor, not the page that was replaced", () => {
  const current = push(initial("/admin/users"), "/admin/license-keys?userId=fixture");
  const replacement = nextAdminEntry({ owner, path: "/admin/license-keys", action: "replace", previous: current });
  assert.equal(replacement.previous, "/admin/users");
});
test("returning from a customer page never guesses an admin browser predecessor", () => {
  assert.equal(nextAdminEntry({ owner, path: "/dashboard", action: "push", previous: initial("/admin") }), null);
  assert.equal(nextAdminEntry({ owner, path: "/admin/users", action: "push", previous: null }).previous, null);
});
test("history from a different login cannot become the new admin's return target", () => {
  const old = push(initial("/admin"), "/admin/users");
  const current = nextAdminEntry({ owner: "other-admin", path: old.path, action: "initial", existing: old, previous: old });
  assert.equal(current.previous, null);
  assert.equal(validAdminEntry(old, "other-admin", old.path), false);
});
test("pop without trusted state uses a parent fallback instead of stale in-memory history", () => {
  assert.equal(nextAdminEntry({ owner, path: "/admin/users", action: "pop", previous: initial("/admin/license-keys") }).previous, null);
});
test("external URLs, login, API and customer routes are never admin return targets", () => {
  for (const path of ["https://example.com/admin", "//example.com/admin", "/login", "/api/admin/users", "/dashboard", "/admin\\evil", "/admin\n"]) {
    assert.equal(isAdminPath(path), false);
  }
  assert.equal(isAdminPath("/admin/users?filter=active"), true);
});
test("root fallback is not another automatic Back-to-home button", () => {
  const root = initial("/admin");
  assert.equal(root.previous, null);
  assert.equal(validAdminEntry({ ...root, previous: "/admin" }, owner, "/admin"), false);
});
test("mobile control and profile back buttons use the shared safe behavior", () => {
  const layout = fs.readFileSync(new URL("../../artifacts/telecampaign/src/components/layout/AppLayout.tsx", import.meta.url), "utf8");
  const profile = fs.readFileSync(new URL("../../artifacts/telecampaign/src/pages/admin-user-support.tsx", import.meta.url), "utf8");
  assert.match(layout, /data-testid="button-admin-back"/);
  assert.match(layout, /onClick=\{goBack\}/);
  assert.equal((profile.match(/onClick=\{goBack\}/g) ?? []).length, 2);
});
