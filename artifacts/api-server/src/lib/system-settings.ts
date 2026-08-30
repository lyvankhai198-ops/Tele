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

export type ConfiguredPlanContent = {
  tagline: string;
  taglineEn: string;
  features: string[];
  featuresEn: string[];
};

export type SupportSettings = {
  telegramUrl: string | null;
  zaloUrl: string | null;
};

export type SystemSettings = {
  planLimits: Record<PlanCode, ConfiguredPlanLimits>;
  planContent: Record<PlanCode, ConfiguredPlanContent>;
  supportLinks: SupportSettings;
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
  nationalDayThemeEnabled: boolean;
  defaultTimezone: string;
};

type StoredSystemSettings = {
  planLimits?: Partial<Record<PlanCode, Partial<ConfiguredPlanLimits>>>;
  planContent?: Partial<Record<PlanCode, Partial<ConfiguredPlanContent>>>;
  supportLinks?: Partial<SupportSettings>;
  groupLibraryVisibleToUsers?: unknown;
  groupLibraryMinimumJoinPlan?: unknown;
  defaultAccountDailyLimit?: unknown;
  campaignDefaults?: Partial<SystemSettings["campaignDefaults"]>;
  registrationEnabled?: unknown;
  maintenanceMode?: unknown;
  nationalDayThemeEnabled?: unknown;
  defaultTimezone?: unknown;
};

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  planLimits: {
    plus: { accountLimit: 1, campaignLimit: 10, messageDailyLimit: 300, userMessageDailyLimit: 3000 },
    pro: { accountLimit: 3, campaignLimit: 50, messageDailyLimit: 600, userMessageDailyLimit: 30000 },
    unlimited: { accountLimit: null, campaignLimit: null, messageDailyLimit: null, userMessageDailyLimit: null },
  },
  planContent: {
    plus: {
      tagline: "Gọn gàng cho một tài khoản vận hành",
      taglineEn: "Simple coverage for one operating account",
      features: [
        "Quản lý chiến dịch",
        "Mẫu tin nhắn",
        "Theo dõi nhật ký",
        "Đồng bộ nhóm tự động",
        "Tự động hóa chiến dịch",
        "Hỗ trợ kỹ thuật",
      ],
      featuresEn: [
        "Campaign management",
        "Message templates",
        "Activity log tracking",
        "Automatic group sync",
        "Campaign automation",
        "Technical support",
      ],
    },
    pro: {
      tagline: "Nhiều không gian hơn cho đội nhóm",
      taglineEn: "More room for your growing team",
      features: [
        "Quản lý chiến dịch",
        "Mẫu tin nhắn",
        "Theo dõi nhật ký",
        "Đồng bộ nhóm tự động",
        "Tự động hóa chiến dịch",
        "Hỗ trợ ưu tiên",
      ],
      featuresEn: [
        "Campaign management",
        "Message templates",
        "Activity log tracking",
        "Automatic group sync",
        "Campaign automation",
        "Priority support",
      ],
    },
    unlimited: {
      tagline: "Không giới hạn tài khoản Telegram",
      taglineEn: "Unlimited Telegram accounts",
      features: [
        "Quản lý chiến dịch",
        "Mẫu tin nhắn",
        "Theo dõi nhật ký",
        "Đồng bộ nhóm tự động",
        "Tự động hóa chiến dịch",
        "Hỗ trợ ưu tiên 24/7",
      ],
      featuresEn: [
        "Campaign management",
        "Message templates",
        "Activity log tracking",
        "Automatic group sync",
        "Campaign automation",
        "Priority support 24/7",
      ],
    },
  },
  supportLinks: {
    telegramUrl: null,
    zaloUrl: null,
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
  nationalDayThemeEnabled: true,
  defaultTimezone: "Asia/Ho_Chi_Minh",
};

export function isSupportUrl(value: string, channel: "telegram" | "zalo"): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const allowedHostnames = channel === "telegram"
      ? ["t.me", "telegram.me"]
      : ["zalo.me"];
    return (
      url.protocol === "https:"
      && allowedHostnames.includes(hostname)
      && url.pathname.length > 1
      && !url.username
      && !url.password
    );
  } catch {
    return false;
  }
}

function normalizedSupportUrl(value: unknown, channel: "telegram" | "zalo"): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && isSupportUrl(trimmed, channel) ? trimmed : null;
}

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

function normalizedPlanContent(
  stored: Partial<ConfiguredPlanContent> | undefined,
  fallback: ConfiguredPlanContent,
): ConfiguredPlanContent {
  const normalizedText = (value: unknown, defaultValue: string, maxLength: number) => (
    typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength
      ? value.trim()
      : defaultValue
  );
  const normalizedFeatures = (value: unknown, defaultValue: string[]) => {
    if (!Array.isArray(value)) return defaultValue;
    const features = value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean);
    return features.length >= 1
      && features.length <= 8
      && features.every((feature) => feature.length <= 120)
      ? features
      : defaultValue;
  };
  return {
    tagline: normalizedText(stored?.tagline, fallback.tagline, 160),
    taglineEn: normalizedText(stored?.taglineEn, fallback.taglineEn, 160),
    features: normalizedFeatures(stored?.features, fallback.features),
    featuresEn: normalizedFeatures(stored?.featuresEn, fallback.featuresEn),
  };
}

function parseSettings(value: string | undefined): SystemSettings {
  if (!value) return structuredClone(DEFAULT_SYSTEM_SETTINGS);
  try {
    const raw = JSON.parse(value) as StoredSystemSettings;
    const planLimits = raw.planLimits ?? {};
    const planContent = raw.planContent ?? {};
    const campaignDefaults = raw.campaignDefaults ?? {};
    return {
      planLimits: {
        plus: normalizedPlanLimits(planLimits.plus, DEFAULT_SYSTEM_SETTINGS.planLimits.plus),
        pro: normalizedPlanLimits(planLimits.pro, DEFAULT_SYSTEM_SETTINGS.planLimits.pro),
        unlimited: normalizedPlanLimits(planLimits.unlimited, DEFAULT_SYSTEM_SETTINGS.planLimits.unlimited),
      },
      planContent: {
        plus: normalizedPlanContent(planContent.plus, DEFAULT_SYSTEM_SETTINGS.planContent.plus),
        pro: normalizedPlanContent(planContent.pro, DEFAULT_SYSTEM_SETTINGS.planContent.pro),
        unlimited: normalizedPlanContent(planContent.unlimited, DEFAULT_SYSTEM_SETTINGS.planContent.unlimited),
      },
      supportLinks: {
        telegramUrl: normalizedSupportUrl(raw.supportLinks?.telegramUrl, "telegram"),
        zaloUrl: normalizedSupportUrl(raw.supportLinks?.zaloUrl, "zalo"),
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
      nationalDayThemeEnabled: typeof raw.nationalDayThemeEnabled === "boolean" ? raw.nationalDayThemeEnabled : DEFAULT_SYSTEM_SETTINGS.nationalDayThemeEnabled,
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