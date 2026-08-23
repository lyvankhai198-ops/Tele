import { eq } from "drizzle-orm";
import { db, systemSettingsTable } from "@workspace/db";

export const TELEGRAM_PURCHASE_URL_KEY = "telegram_purchase_url";

export type PurchaseSettings = {
  telegramPurchaseUrl: string | null;
};

export function isTelegramPurchaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "t.me" || url.hostname === "telegram.me") &&
      url.pathname.length > 1 &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export async function getPurchaseSettings(): Promise<PurchaseSettings> {
  const [setting] = await db
    .select({ value: systemSettingsTable.value })
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, TELEGRAM_PURCHASE_URL_KEY))
    .limit(1);

  return { telegramPurchaseUrl: setting?.value ?? null };
}

export async function updatePurchaseSettings(input: {
  telegramPurchaseUrl: string;
  updatedBy: string;
}): Promise<PurchaseSettings> {
  const [setting] = await db
    .insert(systemSettingsTable)
    .values({
      key: TELEGRAM_PURCHASE_URL_KEY,
      value: input.telegramPurchaseUrl,
      updatedBy: input.updatedBy,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: systemSettingsTable.key,
      set: {
        value: input.telegramPurchaseUrl,
        updatedBy: input.updatedBy,
        updatedAt: new Date(),
      },
    })
    .returning({ value: systemSettingsTable.value });

  return { telegramPurchaseUrl: setting.value };
}