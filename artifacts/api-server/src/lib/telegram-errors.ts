export class TelegramPostingPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramPostingPermissionError";
  }
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