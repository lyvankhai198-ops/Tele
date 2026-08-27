import assert from "node:assert/strict";
import { aggregateActiveGroupRows, type ActiveGroupRow } from "./admin-active-group-directory";

const rows: ActiveGroupRow[] = [
  {
    telegramId: "-100123",
    title: "Nhóm công nghệ",
    username: "@tech_forum",
    kind: "forum",
    memberCount: 1200,
    campaignId: "campaign-a",
    campaignName: "Tin sáng",
    ownerUsername: "khanh",
    telegramAccountName: "Khanh TG",
    roundDelayMinSeconds: 15,
    roundDelayMaxSeconds: 30,
  },
  {
    telegramId: "-100123",
    title: "Tên cũ trên tài khoản khác",
    username: null,
    kind: "forum",
    memberCount: null,
    campaignId: "campaign-b",
    campaignName: "Tin chiều",
    ownerUsername: "linh",
    telegramAccountName: "Linh TG",
    roundDelayMinSeconds: 45,
    roundDelayMaxSeconds: 60,
  },
  {
    telegramId: "-100987",
    title: "Nhóm riêng",
    username: null,
    kind: "group",
    memberCount: null,
    campaignId: "campaign-c",
    campaignName: "Chia sẻ",
    ownerUsername: "minh",
    telegramAccountName: "Minh TG",
    roundDelayMinSeconds: 10,
    roundDelayMaxSeconds: 20,
  },
  {
    telegramId: "-100123",
    title: "Nhóm công nghệ",
    username: "@tech_forum",
    kind: "forum",
    memberCount: 1200,
    campaignId: "campaign-a",
    campaignName: "Tin sáng",
    ownerUsername: "khanh",
    telegramAccountName: "Khanh TG",
    roundDelayMinSeconds: 15,
    roundDelayMaxSeconds: 30,
  },
];

const directory = aggregateActiveGroupRows(rows);

assert.equal(directory.groups.length, 2);

const techGroup = directory.groups.find((group) => group.id === "-100123");
assert.ok(techGroup);
assert.equal(techGroup.telegramLink, "https://t.me/tech_forum");
assert.deepEqual(
  techGroup.campaigns.map((campaign) => [
    campaign.id,
    campaign.telegramAccountName,
    campaign.roundDelayMinSeconds,
    campaign.roundDelayMaxSeconds,
  ]),
  [
    ["campaign-a", "Khanh TG", 15, 30],
    ["campaign-b", "Linh TG", 45, 60],
  ],
);

const privateGroup = directory.groups.find((group) => group.id === "-100987");
assert.ok(privateGroup);
assert.equal(privateGroup.telegramLink, null);

console.log("Admin active group directory aggregation checks passed.");