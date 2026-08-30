export const TELEGRAM_ERROR_CATEGORIES = [
  "session",
  "permission",
  "destination",
  "flood_wait",
  "proxy_network",
  "unknown",
] as const;

export type TelegramErrorCategory = typeof TELEGRAM_ERROR_CATEGORIES[number];

export type TelegramErrorRecoveryAction =
  | "reconnect_account"
  | "check_permissions"
  | "refresh_destination"
  | "wait"
  | "check_proxy"
  | "review";

export type ClassifiedTelegramError = {
  category: TelegramErrorCategory;
  recoveryAction: TelegramErrorRecoveryAction;
  safeMessage: string;
  floodWaitSeconds: number | null;
  safeToRetry: boolean;
};

const textDetails = (error: unknown): string => {
  const candidate = error as {
    name?: unknown;
    message?: unknown;
    errorMessage?: unknown;
    code?: unknown;
  } | null;
  return [candidate?.name, candidate?.message, candidate?.errorMessage, candidate?.code]
    .filter((value): value is string | number => typeof value === "string" || typeof value === "number")
    .join(" ")
    .toUpperCase();
};

const floodWaitSeconds = (error: unknown, details: string): number | null => {
  const explicit = Number((error as { seconds?: unknown } | null)?.seconds);
  if (Number.isSafeInteger(explicit) && explicit > 0) return explicit;
  const match = details.match(/FLOOD(?:_PREMIUM)?_WAIT_?(\d+)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

export function classifyTelegramError(error: unknown): ClassifiedTelegramError {
  const details = textDetails(error);
  const floodSeconds = floodWaitSeconds(error, details);
  if (floodSeconds !== null || /FLOOD_WAIT|FLOOD_PREMIUM_WAIT/.test(details)) {
    return {
      category: "flood_wait",
      recoveryAction: "wait",
      safeMessage: floodSeconds
        ? `Telegram requested a delay of ${floodSeconds} seconds before this delivery can be retried.`
        : "Telegram temporarily rate-limited this delivery.",
      floodWaitSeconds: floodSeconds,
      safeToRetry: true,
    };
  }
  if (/SESSION_REVOKED|AUTH_KEY_UNREGISTERED|SESSION_EXPIRED|USER_DEACTIVATED|PHONE_NUMBER_BANNED|SESSION.*INVALID|ACCOUNT.*NOT CONNECTED|COMPLETED AUTHORIZATION/.test(details)) {
    return {
      category: "session",
      recoveryAction: "reconnect_account",
      safeMessage: "The Telegram account session is no longer valid. Reconnect the account before retrying.",
      floodWaitSeconds: null,
      safeToRetry: true,
    };
  }
  if (/CHAT_WRITE_FORBIDDEN|CHAT_RESTRICTED|USER_BANNED_IN_CHANNEL|RIGHT_FORBIDDEN|POSTING PERMISSION|RESTRICTED OR BANNED|TOPIC_CLOSED/.test(details)) {
    return {
      category: "permission",
      recoveryAction: "check_permissions",
      safeMessage: "The Telegram account no longer has permission to post to this destination.",
      floodWaitSeconds: null,
      safeToRetry: true,
    };
  }
  if (/CHANNEL_INVALID|CHANNEL_PRIVATE|CHAT_ID_INVALID|PEER_ID_INVALID|USERNAME_INVALID|USERNAME_NOT_OCCUPIED|DESTINATION.*UNAVAILABLE|DESTINATION.*NO LONGER|DOES NOT BELONG TO THIS ACCOUNT/.test(details)) {
    return {
      category: "destination",
      recoveryAction: "refresh_destination",
      safeMessage: "The Telegram destination is no longer available to this account. Sync groups before retrying.",
      floodWaitSeconds: null,
      safeToRetry: true,
    };
  }
  if (/TELEGRAMPROXYERROR|PROXY|SOCKS|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|TIMEOUT|NETWORK|SOCKET/.test(details)) {
    const knownConnectionFailure = /TELEGRAMPROXYERROR|PROXY|SOCKS|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/.test(details);
    return {
      category: "proxy_network",
      recoveryAction: "check_proxy",
      safeMessage: knownConnectionFailure
        ? "Telegram could not be reached through the configured proxy or network. Check the connection before retrying."
        : "The Telegram network response was interrupted. Review Telegram before deciding whether to retry.",
      floodWaitSeconds: null,
      safeToRetry: knownConnectionFailure,
    };
  }
  return {
    category: "unknown",
    recoveryAction: "review",
    safeMessage: "Telegram did not confirm this delivery. Review the destination in Telegram before taking further action.",
    floodWaitSeconds: null,
    safeToRetry: false,
  };
}