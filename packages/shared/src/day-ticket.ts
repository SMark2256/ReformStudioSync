import {
  addDaysToDayKey,
  type BookingRuleSettings,
  type HolidayOverrideInput,
  resolveDayHours,
  studioDateTime,
} from './booking-rules';
import { toStudioDayKey } from './pass-rules';

/**
 * Napijegy (TICKET-7). Egy alkalom, a vásárlás napján zárásig érvényes. A zárást a foglalási
 * modul nyitvatartása adja (`resolveDayHours`: heti nyitvatartás, munkaszüneti nap, recepciós
 * felülírás). A lejáratot eladáskor egyszer számoljuk és a bérleten tároljuk (`validUntil`), így a
 * nyitvatartás későbbi módosítása az eladott jegyet nem változtatja meg.
 */

/** A napijegy sablonja mindig egy alkalmas; a `durationDays` napijegynél nem számít, 1 nap. */
export const DAY_TICKET_TOTAL_PASSES = 1;
export const DAY_TICKET_DURATION_DAYS = 1;

/**
 * A napijegy lejárata a vásárlás pillanatából:
 * - nyitvatartási napon a nap zárása;
 * - zárt napon (hétvége, ünnep, rendkívüli zárás), vagy ha a zárás már elmúlt, a nap vége
 *   (23:59:59.999, Europe/Budapest), hogy a kiadott jegy aznap még felhasználható legyen.
 */
export function dayTicketValidUntil(
  soldAt: Date,
  settings: Pick<BookingRuleSettings, 'openingHours'>,
  overrides: readonly HolidayOverrideInput[] = [],
): Date {
  const dayKey = toStudioDayKey(soldAt);
  const endOfDay = new Date(studioDateTime(addDaysToDayKey(dayKey, 1), 0).getTime() - 1);
  const { hours } = resolveDayHours(dayKey, settings, overrides);
  if (!hours) return endOfDay;
  const closing = studioDateTime(dayKey, hours.closesAt);
  return closing.getTime() > soldAt.getTime() ? closing : endOfDay;
}
