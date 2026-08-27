import { eq } from "drizzle-orm";
import { db, systemSettingsTable } from "@workspace/db";

export const SYSTEM_SETTINGS_KEY = "admin_system_settings";
export const PLAN_CODES = ["plus", "pro", "unlimited"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export type ConfiguredPlanLimits = {
  accountLimit: number | null;
  campaignLimit: number | null;
  messageDailyLimit: number | null;
  userMessageDailyLimit: number | null;
};

export type SystemSettings = {
  planLimits: Record<PlanCode, ConfiguredPlanLimits>;
  groupLibraryVisibleToUsers: boolean;
  groupLibraryMinimumJoinPlan: "pro" | "unlimited";
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
  groupLibraryVisibleToUsers?: unknown;
  groupLibraryMinimumJoinPlan?: unknown;
  defaultAccountDailyLimit?: unknown;
  campaignDefaults?: Partial<SystemSettings["campaignDefaults"]>;
  registrationEnabled?: unknown;
  maintenanceMode?: unknown;
  defaultTimezone?: unknown;
};

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  planLimits: {
    plus: { accountLimit: 1, campaignLimit: 10, messageDailyLimit: 300, userMessageDailyLimit: 3000 },
    pro: { accountLimit: 3, campaignLimit: 50, messageDailyLimit: 600, userMessageDailyLimit: 30000 },
    unlimited: { accountLimit: null, campaignLimit: null, messageDailyLimit: null, userMessageDailyLimit: null },
  },
  groupLibraryVisibleToUsers: false,
  groupLibraryMinimumJoinPlan: "pro",
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

function userDailyLimit(
  value: unknown,
  campaignLimit: number | null,
  messageDailyLimit: number | null,
): number | null {
  if (value === null) return null;
  if (isFiniteInteger(value, 0, 100000000)) return value;
  if (campaignLimit === null || messageDailyLimit === null) return null;
  return campaignLimit * messageDailyLimit;
}

function normalizedPlanLimits(
  stored: Partial<ConfiguredPlanLimits> | undefined,
  fallback: ConfiguredPlanLimits,
): ConfiguredPlanLimits {
  const accountLimit = stored?.accountLimit === undefined
    ? fallback.accountLimit
    : nullableLimit(stored.accountLimit, 100000);
  const campaignLimit = stored?.campaignLimit === undefined
    ? fallback.campaignLimit
    : nullableLimit(stored.campaignLimit, 100000);
  const messageDailyLimit = stored?.messageDailyLimit === undefined
    ? fallback.messageDailyLimit
    : nullableLimit(stored.messageDailyLimit, 10000000);
  return {
    accountLimit,
    campaignLimit,
    messageDailyLimit,
    userMessageDailyLimit: stored?.userMessageDailyLimit === undefined
      ? userDailyLimit(undefined, campaignLimit, messageDailyLimit)
      : userDailyLimit(stored.userMessageDailyLimit, campaignLimit, messageDailyLimit),
  };
}

function parseSettings(value: string | undefined): SystemSettings {
  if (!value) return structuredClone(DEFAULT_SYSTEM_SETTINGS);
  try {
    const raw = JSON.parse(value) as StoredSystemSettings;
    const planLimits = raw.planLimits ?? {};
    const campaignDefaults = raw.campaignDefaults ?? {};
    return {
      planLimits: {
        plus: normalizedPlanLimits(planLimits.plus, DEFAULT_SYSTEM_SETTINGS.planLimits.plus),
        pro: normalizedPlanLimits(planLimits.pro, DEFAULT_SYSTEM_SETTINGS.planLimits.pro),
        unlimited: normalizedPlanLimits(planLimits.unlimited, DEFAULT_SYSTEM_SETTINGS.planLimits.unlimited),
      },
      groupLibraryVisibleToUsers: typeof raw.groupLibraryVisibleToUsers === "boolean"
        ? raw.groupLibraryVisibleToUsers
        : DEFAULT_SYSTEM_SETTINGS.groupLibraryVisibleToUsers,
      groupLibraryMinimumJoinPlan: raw.groupLibraryMinimumJoinPlan === "unlimited"
        ? "unlimited"
        : DEFAULT_SYSTEM_SETTINGS.groupLibraryMinimumJoinPlan,
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