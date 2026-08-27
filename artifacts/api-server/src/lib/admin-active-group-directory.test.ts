import assert from "node:assert/strict";
import {
  aggregateSavedGroupRows,
  dedupeRunningGroupLibraryCandidates,
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
assert.deepEqual(
  techGroup.roundDelays.map((delay) => [
    delay.minSeconds,
    delay.maxSeconds,
  ]),
  [
    [15, 30],
    [45, 60],
  ],
);

const privateGroup = directory.groups.find((group) => group.id === "-100987");
assert.ok(privateGroup);
assert.equal(privateGroup.telegramLink, null);
assert.deepEqual(privateGroup.roundDelays, []);

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

console.log("Admin group library aggregation and one-time import checks passed.");