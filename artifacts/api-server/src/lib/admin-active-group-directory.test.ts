import assert from "node:assert/strict";
import {
  aggregateSavedGroupRows,
  dedupeRunningGroupLibraryCandidates,
  redactGroupLibraryGroups,
  type SavedGroupRow,
} from "./admin-active-group-directory";

const rows: SavedGroupRow[] = [
  {
    telegramId: "-100123",
    title: "Nhóm công nghệ",
    username: "@tech_forum",
    kind: "forum",
    memberCount: 1200,
    roundDelayMinSeconds: 15,
    roundDelayMaxSeconds: 30,
  },
  {
    telegramId: "-100123",
    title: "Tên cũ trên tài khoản khác",
    username: null,
    kind: "forum",
    memberCount: null,
    roundDelayMinSeconds: 45,
    roundDelayMaxSeconds: 60,
  },
  {
    telegramId: "-100987",
    title: "Nhóm riêng",
    username: null,
    kind: "group",
    memberCount: null,
    roundDelayMinSeconds: null,
    roundDelayMaxSeconds: null,
  },
  {
    telegramId: "-100123",
    title: "Nhóm công nghệ",
    username: "@tech_forum",
    kind: "forum",
    memberCount: 1200,
    roundDelayMinSeconds: 15,
    roundDelayMaxSeconds: 30,
  },
];

const directory = aggregateSavedGroupRows(rows);

assert.equal(directory.groups.length, 2);

const techGroup = directory.groups.find((group) => group.id === "-100123");
assert.ok(techGroup);
assert.equal(techGroup.telegramLink, "https://t.me/tech_forum");
assert.equal(techGroup.isPublished, true);
assert.deepEqual(
  techGroup.roundDelays.map((delay) => [
    delay.minSeconds,
    delay.maxSeconds,
  ]),
  [
    [45, 60],
    [15, 30],
  ],
);
assert.equal(techGroup.roundDelays[0]?.isPreferred, true);
assert.equal(techGroup.roundDelays[0]?.errorRate, null);

const privateGroup = directory.groups.find((group) => group.id === "-100987");
assert.ok(privateGroup);
assert.equal(privateGroup.telegramLink, null);
assert.deepEqual(privateGroup.roundDelays, []);

const pendingDirectory = aggregateSavedGroupRows([{
  telegramId: "-100555",
  title: "Nhóm mới chờ import",
  username: null,
  kind: "group",
  memberCount: null,
  isPublished: false,
  roundDelayMinSeconds: null,
  roundDelayMaxSeconds: null,
}]);
assert.equal(pendingDirectory.groups[0]?.isPublished, false);

const rankedDirectory = aggregateSavedGroupRows(rows, [
  {
    telegramId: "-100123",
    roundDelayMinSeconds: 15,
    roundDelayMaxSeconds: 30,
    sentCount: 99,
    errorCount: 1,
  },
  {
    telegramId: "-100123",
    roundDelayMinSeconds: 45,
    roundDelayMaxSeconds: 60,
    sentCount: 1,
    errorCount: 0,
  },
]);
const rankedGroup = rankedDirectory.groups.find((group) => group.id === "-100123");
assert.ok(rankedGroup);
assert.deepEqual(
  rankedGroup.roundDelays.map((delay) => [
    delay.minSeconds,
    delay.maxSeconds,
    delay.sampleCount,
    delay.errorRate,
    delay.isPreferred,
  ]),
  [
    [15, 30, 100, 0.01, true],
    [45, 60, 1, 0, false],
  ],
);

const candidates = dedupeRunningGroupLibraryCandidates([
  {
    telegramId: "-100123",
    title: "Nhóm công nghệ",
    username: "@tech_forum",
    kind: "forum",
    memberCount: 1200,
    sourceDestinationId: "destination-one",
  },
  {
    telegramId: "-100123",
    title: "Tên trùng từ account khác",
    username: null,
    kind: "forum",
    memberCount: null,
    sourceDestinationId: "destination-two",
  },
  {
    telegramId: "-100555",
    title: "Nhóm chỉ mới có campaign đang chạy",
    username: null,
    kind: "group",
    memberCount: null,
    sourceDestinationId: "destination-three",
  },
]);
assert.equal(candidates.length, 2);
assert.equal(candidates[0]?.sourceDestinationId, "destination-one");
assert.equal(candidates[1]?.telegramId, "-100555");

const lockedGroups = redactGroupLibraryGroups(directory.groups, false);
assert.equal(lockedGroups.length, directory.groups.length);
assert.equal(lockedGroups[0]?.id, "locked-group-1");
assert.notEqual(lockedGroups[0]?.id, directory.groups[0]?.id);
assert.equal(lockedGroups[0]?.title, "••••••••••");
assert.equal(lockedGroups[0]?.username, null);
assert.equal(lockedGroups[0]?.telegramLink, null);
assert.equal(lockedGroups[0]?.kind, "");
assert.equal(lockedGroups[0]?.memberCount, directory.groups[0]?.memberCount);
assert.equal(lockedGroups[0]?.isPublished, true);
assert.deepEqual(lockedGroups[0]?.roundDelays, []);
assert.strictEqual(redactGroupLibraryGroups(directory.groups, true), directory.groups);

console.log("Admin group library aggregation and one-time import checks passed.");