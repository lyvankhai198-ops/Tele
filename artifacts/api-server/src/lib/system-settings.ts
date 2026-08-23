import { eq } from "drizzle-orm";
import { db, systemSettingsTable } from "@workspace/db";

export const SYSTEM_SETTINGS_KEY = "admin_system_settings";
export const PLAN_CODES = ["plus", "pro", "unlimited"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export type ConfiguredPlanLimits = {
  accountLimit: number | null;
  campaignLimit: number | null;
  messageDailyLimit: number | null;
};

export type SystemSettings = {
  planLimits: Record<PlanCode, ConfiguredPlanLimits>;
  defaultAccountDailyLimit: number;
  campaignDefaults: {
    maxRetries: number;
    roundDelayMinSeconds: number;
    roundDelayMaxSeconds: number;
  };
  registrationEnabled: boolean;
  maintenanceMode: boolean;
  defaultTimezone: string;
};

type StoredSystemSettings = {
  planLimits?: Partial<Record<PlanCode, Partial<ConfiguredPlanLimits>>>;
  defaultAccountDailyLimit?: unknown;
  campaignDefaults?: Partial<SystemSettings["campaignDefaults"]>;
  registrationEnabled?: unknown;
  maintenanceMode?: unknown;
  defaultTimezone?: unknown;
};

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  planLimits: {
    plus: { accountLimit: 1, campaignLimit: 10, messageDailyLimit: 200 },
    pro: { accountLimit: 3, campaignLimit: 50, messageDailyLimit: 600 },
    unlimited: { accountLimit: null, campaignLimit: null, messageDailyLimit: null },
  },
  defaultAccountDailyLimit: 200,
  campaignDefaults: {
    maxRetries: 3,
    roundDelayMinSeconds: 1,
    roundDelayMaxSeconds: 3,
  },
  registrationEnabled: true,
  maintenanceMode: false,
  defaultTimezone: "Asia/Ho_Chi_Minh",
};

function isFiniteInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function nullableLimit(value: unknown, max: number): number | null {
  return value === null || isFiniteInteger(value, 0, max) ? value : 0;
}

function parseSettings(value: string | undefined): SystemSettings {
  if (!value) return structuredClone(DEFAULT_SYSTEM_SETTINGS);
  try {
    const raw = JSON.parse(value) as StoredSystemSettings;
    const planLimits = raw.planLimits ?? {};
    const campaignDefaults = raw.campaignDefaults ?? {};
    return {
      planLimits: {
        plus: {
          accountLimit: nullableLimit(planLimits.plus?.accountLimit, 100000),
          campaignLimit: nullableLimit(planLimits.plus?.campaignLimit, 100000),
          messageDailyLimit: nullableLimit(planLimits.plus?.messageDailyLimit, 10000000),
        },
        pro: {
          accountLimit: nullableLimit(planLimits.pro?.accountLimit, 100000),
          campaignLimit: nullableLimit(planLimits.pro?.campaignLimit, 100000),
          messageDailyLimit: nullableLimit(planLimits.pro?.messageDailyLimit, 10000000),
        },
        unlimited: {
          accountLimit: nullableLimit(planLimits.unlimited?.accountLimit, 100000),
          campaignLimit: nullableLimit(planLimits.unlimited?.campaignLimit, 100000),
          messageDailyLimit: nullableLimit(planLimits.unlimited?.messageDailyLimit, 10000000),
        },
      },
      defaultAccountDailyLimit: isFiniteInteger(raw.defaultAccountDailyLimit, 1, 100000)
        ? raw.defaultAccountDailyLimit
        : DEFAULT_SYSTEM_SETTINGS.defaultAccountDailyLimit,
      campaignDefaults: {
        maxRetries: isFiniteInteger(campaignDefaults.maxRetries, 0, 20) ? campaignDefaults.maxRetries : DEFAULT_SYSTEM_SETTINGS.campaignDefaults.maxRetries,
        roundDelayMinSeconds: isFiniteInteger(campaignDefaults.roundDelayMinSeconds, 0, 259200) ? campaignDefaults.roundDelayMinSeconds : DEFAULT_SYSTEM_SETTINGS.campaignDefaults.roundDelayMinSeconds,
        roundDelayMaxSeconds: isFiniteInteger(campaignDefaults.roundDelayMaxSeconds, 0, 259200) ? campaignDefaults.roundDelayMaxSeconds : DEFAULT_SYSTEM_SETTINGS.campaignDefaults.roundDelayMaxSeconds,
      },
      registrationEnabled: typeof raw.registrationEnabled === "boolean" ? raw.registrationEnabled : DEFAULT_SYSTEM_SETTINGS.registrationEnabled,
      maintenanceMode: typeof raw.maintenanceMode === "boolean" ? raw.maintenanceMode : DEFAULT_SYSTEM_SETTINGS.maintenanceMode,
      defaultTimezone: typeof raw.defaultTimezone === "string" && raw.defaultTimezone ? raw.defaultTimezone : DEFAULT_SYSTEM_SETTINGS.defaultTimezone,
    };
  } catch {
    return structuredClone(DEFAULT_SYSTEM_SETTINGS);
  }
}

export async function getSystemSettings(): Promise<SystemSettings> {
  const [setting] = await db.select({ value: systemSettingsTable.value })
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, SYSTEM_SETTINGS_KEY))
    .limit(1);
  return parseSettings(setting?.value);
}

export async function updateSystemSettings(settings: SystemSettings, updatedBy: string): Promise<SystemSettings> {
  await db.insert(systemSettingsTable)
    .values({
      key: SYSTEM_SETTINGS_KEY,
      value: JSON.stringify(settings),
      updatedBy,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: systemSettingsTable.key,
      set: {
        value: JSON.stringify(settings),
        updatedBy,
        updatedAt: new Date(),
      },
    });
  return settings;
}