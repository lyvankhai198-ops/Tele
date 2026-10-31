import { statfs } from "node:fs/promises";
import { getSystemSettings } from "./system-settings";

type Heartbeat = { startedAt: number; lastSuccessAt: number | null; lastErrorAt: number | null; busy: boolean };
const workers = new Map<string, Heartbeat>();

export function registerWorker(name: string): void {
  if (!workers.has(name)) workers.set(name, { startedAt: Date.now(), lastSuccessAt: null, lastErrorAt: null, busy: false });
}
export function workerHeartbeat(name: string, success: boolean, busy = false): void {
  registerWorker(name);
  const worker = workers.get(name)!;
  worker.busy = busy;
  if (success) worker.lastSuccessAt = Date.now();
  else worker.lastErrorAt = Date.now();
}
export async function getWorkerHealth() {
  const settings = await getSystemSettings();
  const expected = [
    ["telegram", Boolean((process.env.TELECAMPAIGN_SUPPORT_BOT_TOKEN || process.env.TELECAMPAIGN_KGPT_BOT_TOKEN) &&
      settings.supportChat.enabled && settings.supportChat.telegramBridgeEnabled && settings.supportChat.adminTelegramChatId)],
    ["campaign", process.env.TELECAMPAIGN_DISABLE_WORKER !== "true"],
    ["payments", process.env.TELECAMPAIGN_DISABLE_PAYMENT_WORKER !== "true"],
    ["reminders", process.env.TELECAMPAIGN_DISABLE_WORKER !== "true" && process.env.TELECAMPAIGN_DISABLE_SUBSCRIPTION_REMINDER_WORKER !== "true"],
  ] as const;
  const now = Date.now();
  const status = expected.map(([name, enabled]) => {
    const heartbeat = workers.get(name);
    const age = heartbeat ? now - (heartbeat.lastSuccessAt ?? heartbeat.startedAt) : process.uptime() * 1000;
    return {
      name, enabled, ...heartbeat,
      status: !enabled ? "disabled" : age > (name === "reminders" ? 900_000 : name === "payments" ? 300_000 : 180_000)
        ? "stale" : heartbeat?.lastSuccessAt ? "ok" : "starting",
    };
  });
  let disk: { availablePercent: number; status: string } | null = null;
  try {
    const fs = await statfs(process.cwd());
    const availablePercent = fs.blocks ? Math.round(fs.bavail / fs.blocks * 100) : 100;
    disk = { availablePercent, status: availablePercent < 10 ? "low" : "ok" };
  } catch { /* Do not expose filesystem paths. */ }
  return { checkedAt: new Date().toISOString(), workers: status, disk };
}
