/** Explicit evidence from Telegram rights, not an inference from an old 403. */
export const INDEFINITE_POSTING_RESTRICTION = "Telegram confirmed an indefinite posting restriction";
export const DATED_POSTING_RESTRICTION = "Telegram confirmed a dated posting restriction";
export const POSTING_PERMISSION_UNVERIFIED = "Telegram posting permission could not be verified";
export const LONG_POSTING_RESTRICTION_MS = 30 * 24 * 60 * 60_000;

type Rights = { sendMessages?: boolean; sendPlain?: boolean; untilDate?: number };
type Entity = {
  broadcast?: boolean; creator?: boolean; adminRights?: { postMessages?: boolean };
  bannedRights?: Rights; defaultBannedRights?: Rights;
};

export function telegramPostingPermissionSnapshot(entity: Entity, now = Date.now()) {
  const available = { canPost: true, restrictedUntil: null, permissionReason: "Posting permission available" };
  if (entity.broadcast) return entity.creator || entity.adminRights?.postMessages ? available
    : { canPost: false, restrictedUntil: null, permissionReason: INDEFINITE_POSTING_RESTRICTION };
  if (entity.creator || entity.adminRights) return available;
  const individual = entity.bannedRights;
  const rights = individual && (individual.sendMessages !== undefined || individual.sendPlain !== undefined)
    ? individual : entity.defaultBannedRights;
  if (!rights || (rights.sendMessages !== true && rights.sendPlain !== true)) return available;
  const until = rights.untilDate;
  if (typeof until === "number" && Number.isFinite(until) && until > 0) {
    if (until * 1000 <= now) return available;
    return { canPost: false, restrictedUntil: new Date(until * 1000), permissionReason: DATED_POSTING_RESTRICTION };
  }
  return { canPost: false, restrictedUntil: null,
    permissionReason: until === 0 ? INDEFINITE_POSTING_RESTRICTION : POSTING_PERMISSION_UNVERIFIED };
}

export function isLongPostingRestriction(evidence: {
  canPost: boolean; permissionReason: string | null; permissionCheckedAt: Date | null;
  restrictedUntil: Date | null; lastSentAt: Date | null; lastFailedAt: Date | null;
}, now = Date.now()) {
  if (evidence.canPost || !evidence.permissionCheckedAt) return false;
  const checked = evidence.permissionCheckedAt.getTime();
  if (!Number.isFinite(checked) || checked > now
    || checked < Math.max(evidence.lastSentAt?.getTime() ?? 0, evidence.lastFailedAt?.getTime() ?? 0)) return false;
  if (evidence.permissionReason === INDEFINITE_POSTING_RESTRICTION) return true;
  return evidence.permissionReason === DATED_POSTING_RESTRICTION
    && Boolean(evidence.restrictedUntil
      && evidence.restrictedUntil.getTime() - now >= LONG_POSTING_RESTRICTION_MS);
}
