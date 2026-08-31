export class TelegramPostingPermissionError extends Error {
  restrictedUntil: Date | null;

  constructor(message: string, restrictedUntil: Date | null = null) {
    super(message);
    this.name = "TelegramPostingPermissionError";
    this.restrictedUntil = restrictedUntil;
  }
}

export const TELEGRAM_RESTRICTION_SAFETY_BUFFER_MS = 5 * 60_000;

export function telegramSendRestrictionIsActive(
  rights: { sendMessages?: boolean; untilDate?: number } | null | undefined,
  now = new Date(),
): boolean {
  if (rights?.sendMessages !== true) return false;
  if (typeof rights.untilDate !== "number" || !Number.isFinite(rights.untilDate) || rights.untilDate <= 0) {
    return true;
  }
  return rights.untilDate * 1000 > now.getTime();
}

export function canScheduleTelegramDestination(
  destination: { canPost: boolean; restrictedUntil: Date | null },
  scheduledAt: Date | null,
): boolean {
  if (destination.canPost) return true;
  if (!destination.restrictedUntil || !scheduledAt) return false;
  return scheduledAt.getTime() >= destination.restrictedUntil.getTime() + TELEGRAM_RESTRICTION_SAFETY_BUFFER_MS;
}

const TELEGRAM_POSTING_PERMISSION_ERROR_CODES = new Set([
  "CHANNEL_PRIVATE",
  "CHAT_ADMIN_REQUIRED",
  "CHAT_SEND_MEDIA_FORBIDDEN",
  "CHAT_SEND_PHOTOS_FORBIDDEN",
  "CHAT_SEND_PLAIN_FORBIDDEN",
  "CHAT_WRITE_FORBIDDEN",
  "USER_BANNED_IN_CHANNEL",
  "USER_NOT_PARTICIPANT",
]);

const TELEGRAM_POSTING_PERMISSION_ERROR_PHRASES = [
  "TELEGRAM POSTING PERMISSION IS NO LONGER AVAILABLE",
  "ACCOUNT MAY BE RESTRICTED OR BANNED FROM POSTING",
  "DESTINATION IS UNAVAILABLE TO THIS ACCOUNT",
];

export function telegramPostingPermissionFailureReason(error: unknown): string | null {
  if (error instanceof TelegramPostingPermissionError) return error.message;
  const candidate = error as { errorMessage?: unknown; message?: unknown };
  const errorCode = typeof candidate?.errorMessage === "string"
    ? candidate.errorMessage.toUpperCase()
    : "";
  const message = typeof candidate?.message === "string" ? candidate.message : "";
  const normalizedMessage = message.toUpperCase();
  const hasKnownCode = TELEGRAM_POSTING_PERMISSION_ERROR_CODES.has(errorCode)
    || [...TELEGRAM_POSTING_PERMISSION_ERROR_CODES].some((code) => normalizedMessage.includes(code));
  const hasKnownPhrase = TELEGRAM_POSTING_PERMISSION_ERROR_PHRASES.some((phrase) =>
    normalizedMessage.includes(phrase),
  );
  if (!hasKnownCode && !hasKnownPhrase) return null;
  return "Telegram rejected posting to this destination because the account is restricted, banned, or no longer has posting permission. Deselect this group from the campaign, or sync the account again after access is restored.";
}

export function telegramPostingPermissionRestrictedUntil(error: unknown): Date | null {
  if (error instanceof TelegramPostingPermissionError) return error.restrictedUntil;
  const candidate = error as { restrictedUntil?: unknown };
  if (candidate?.restrictedUntil instanceof Date && !Number.isNaN(candidate.restrictedUntil.getTime())) {
    return candidate.restrictedUntil;
  }
  return null;
}