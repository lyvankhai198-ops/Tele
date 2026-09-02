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
  firstCapturedAt: "2026-08-28T10:00:00.000Z",
  roundDelayMinSeconds: null,
  roundDelayMaxSeconds: null,
}]);
assert.equal(pendingDirectory.groups[0]?.isPublished, false);

const sortedDirectory = aggregateSavedGroupRows([
  {
    telegramId: "-100001",
    title: "Nhóm đã import nhiều thành viên",
    username: null,
    kind: "group",
    memberCount: 5000,
    isPublished: true,
    firstCapturedAt: "2026-08-27T10:00:00.000Z",
    roundDelayMinSeconds: null,
    roundDelayMaxSeconds: null,
  },
  {
    telegramId: "-100002",
    title: "Nhóm mới ít thành viên",
    username: null,
    kind: "group",
    memberCount: 10,
    isPublished: false,
    firstCapturedAt: "2026-08-29T10:00:00.000Z",
    roundDelayMinSeconds: null,
    roundDelayMaxSeconds: null,
  },
  {
    telegramId: "-100003",
    title: "Nhóm mới nhiều thành viên",
    username: null,
    kind: "group",
    memberCount: 9000,
    isPublished: false,
    firstCapturedAt: "2026-08-28T10:00:00.000Z",
    roundDelayMinSeconds: null,
    roundDelayMaxSeconds: null,
  },
]);
assert.deepEqual(
  sortedDirectory.groups.map((group) => group.id),
  ["-100002", "-100003", "-100001"],
);
const importedSortedDirectory = aggregateSavedGroupRows(sortedDirectory.groups.map((group) => ({
  telegramId: group.id,
  title: group.title,
  username: group.username,
  kind: group.kind,
  memberCount: group.memberCount,
  isPublished: true,
  roundDelayMinSeconds: null,
  roundDelayMaxSeconds: null,
})));
assert.deepEqual(
  importedSortedDirectory.groups.map((group) => group.id),
  ["-100003", "-100001", "-100002"],
);

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
    username: "@tech_forum_backup",
    kind: "forum",
    memberCount: 1500,
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
assert.equal(candidates[0]?.username, "@tech_forum");
assert.equal(candidates[0]?.memberCount, 1500);
assert.equal(candidates[1]?.telegramId, "-100555");

const directoryWithThreeGroups = {
  groups: [
    ...directory.groups,
    {
      ...directory.groups[0]!,
      id: "-100777",
      title: "Nhóm bị khóa",
      username: "@locked_group",
      telegramLink: "https://t.me/locked_group",
    },
  ],
};
const lockedGroups = redactGroupLibraryGroups(directoryWithThreeGroups.groups, false);
assert.equal(lockedGroups.length, directoryWithThreeGroups.groups.length);
assert.equal(lockedGroups[0]?.id, directory.groups[0]?.id);
assert.equal(lockedGroups[0]?.title, directory.groups[0]?.title);
assert.equal(lockedGroups[0]?.telegramLink, directory.groups[0]?.telegramLink);
assert.equal(lockedGroups[1]?.id, directory.groups[1]?.id);
assert.equal(lockedGroups[2]?.id, "locked-group-3");
assert.notEqual(lockedGroups[2]?.id, directoryWithThreeGroups.groups[2]?.id);
assert.equal(lockedGroups[2]?.title, "••••••••••");
assert.equal(lockedGroups[2]?.username, null);
assert.equal(lockedGroups[2]?.telegramLink, null);
assert.equal(lockedGroups[2]?.kind, directoryWithThreeGroups.groups[2]?.kind);
assert.equal(lockedGroups[2]?.memberCount, directoryWithThreeGroups.groups[2]?.memberCount);
assert.equal(lockedGroups[2]?.isPublished, true);
assert.deepEqual(
  lockedGroups[2]?.roundDelays.map((delay) => [delay.minSeconds, delay.maxSeconds]),
  [
    [45, 60],
    [15, 30],
  ],
);
assert.strictEqual(redactGroupLibraryGroups(directory.groups, true), directory.groups);

const configuredPreview = redactGroupLibraryGroups([
  {
    ...directory.groups[0]!,
    id: "-100001",
    title: "Nhóm cũ",
    telegramLink: "https://t.me/old_group",
    trialVisible: false,
    trialTitle: null,
  },
  {
    ...directory.groups[1]!,
    id: "-100002",
    title: "Tên nội bộ",
    telegramLink: "https://t.me/trial_one",
    trialVisible: true,
    trialTitle: "Cộng đồng MMO Việt",
  },
  {
    ...directory.groups[0]!,
    id: "-100003",
    title: "Tên nội bộ 2",
    telegramLink: "https://t.me/trial_two",
    trialVisible: true,
    trialTitle: "Nhóm kiếm tiền online",
  },
], false);
assert.deepEqual(configuredPreview.map((group) => group.id), ["-100002", "-100003", "locked-group-1"]);
assert.equal(configuredPreview[0]?.title, "Cộng đồng MMO Việt");
assert.equal(configuredPreview[0]?.telegramLink, "https://t.me/trial_one");
assert.equal(configuredPreview[1]?.title, "Nhóm kiếm tiền online");
assert.equal(configuredPreview[1]?.telegramLink, "https://t.me/trial_two");
assert.equal(configuredPreview[2]?.title, "••••••••••");
assert.equal(configuredPreview[2]?.telegramLink, null);

console.log("Admin group library aggregation and one-time import checks passed.");