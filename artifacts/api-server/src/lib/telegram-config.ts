export type TelegramConfiguration = {
  configured: boolean;
  missing: string[];
  apiId: number | null;
};

export function getTelegramConfiguration(): TelegramConfiguration {
  const missing = ["TELEGRAM_API_ID", "TELEGRAM_API_HASH"].filter(
    (key) => !process.env[key],
  );
  const parsedApiId = Number(process.env.TELEGRAM_API_ID);
  return {
    configured: missing.length === 0 && Number.isInteger(parsedApiId) && parsedApiId > 0,
    missing: Number.isInteger(parsedApiId) && parsedApiId > 0
      ? missing
      : Array.from(new Set([...missing, "TELEGRAM_API_ID"])),
    apiId: Number.isInteger(parsedApiId) && parsedApiId > 0 ? parsedApiId : null,
  };
}

export function requireTelegramConfiguration(): { apiId: number; apiHash: string } {
  const configuration = getTelegramConfiguration();
  if (!configuration.configured || !configuration.apiId || !process.env.TELEGRAM_API_HASH) {
    throw new Error(`Telegram integration is not configured. Missing: ${configuration.missing.join(", ")}`);
  }
  return { apiId: configuration.apiId, apiHash: process.env.TELEGRAM_API_HASH };
}