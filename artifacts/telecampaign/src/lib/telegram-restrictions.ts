export const TELEGRAM_RESTRICTION_SAFETY_BUFFER_MS = 5 * 60_000;
const MINUTE_MS = 60_000;

type RestrictionDestination = {
  canPost: boolean;
  restrictedUntil: string | Date | null;
};

function validRestrictionDate(value: string | Date | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function temporaryRestrictionUntil(
  destination: RestrictionDestination,
  now = new Date(),
): Date | null {
  if (destination.canPost) return null;
  const restrictedUntil = validRestrictionDate(destination.restrictedUntil);
  return restrictedUntil && restrictedUntil > now ? restrictedUntil : null;
}

export function canChooseRestrictedDestination(
  destination: RestrictionDestination,
  now = new Date(),
): boolean {
  return destination.canPost || temporaryRestrictionUntil(destination, now) !== null;
}

export function suggestedRestrictionSchedule(
  destinations: readonly RestrictionDestination[],
  now = new Date(),
): Date | null {
  const latestRestriction = destinations.reduce<Date | null>((latest, destination) => {
    const restrictedUntil = temporaryRestrictionUntil(destination, now);
    if (!restrictedUntil) return latest;
    return !latest || restrictedUntil > latest ? restrictedUntil : latest;
  }, null);
  if (!latestRestriction) return null;
  const safeBoundaryMs = latestRestriction.getTime() + TELEGRAM_RESTRICTION_SAFETY_BUFFER_MS;
  return new Date(Math.ceil(safeBoundaryMs / MINUTE_MS) * MINUTE_MS);
}

export function scheduleMeetsRestrictionSuggestion(
  scheduledAt: Date | null,
  suggestedAt: Date | null,
): boolean {
  return !suggestedAt || Boolean(scheduledAt && scheduledAt >= suggestedAt);
}

export function localScheduleFields(value: Date): { date: string; time: string } {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hour = String(value.getHours()).padStart(2, "0");
  const minute = String(value.getMinutes()).padStart(2, "0");
  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
}