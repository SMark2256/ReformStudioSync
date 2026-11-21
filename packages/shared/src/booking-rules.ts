import { Gender, PassStatus, PassType } from './enums';
import { womenOnlyAccess } from './gender';
import { STUDIO_TIME_ZONE } from './membership-dues';
import {
  getPassStatus,
  passCoversService,
  type PassStatusInput,
  toStudioDayKey,
} from './pass-rules';

/**
 * Online időpontfoglalás szabályai (TICKET-57). Tiszta függvények: az API foglalási motorja és a
 * kliensoldali mock ugyanezt hívja. Minden naptári számítás a stúdió időzónájában
 * (Europe/Budapest) történik, a nyári időszámítás váltásával együtt. Az időpontok UTC `Date`-ek,
 * a naptári nap `YYYY-MM-DD` kulcs (`toStudioDayKey`), a napon belüli idő perc éjfél óta.
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// ---------------------------------------------------------------------------
// Beállítások
// ---------------------------------------------------------------------------

/** Egy nap nyitvatartása percben, éjféltől (07:00 = 420). */
export interface DayHours {
  opensAt: number;
  closesAt: number;
  /** Utolsó kezdés (TICKET-59); hiányzik: a zárásig bármikor kezdődhet, ami belefér. */
  lastStartAt?: number;
}

/** Heti nyitvatartás: 0 = hétfő … 6 = vasárnap; `null` = zárva. */
export type WeeklyOpeningHours = (DayHours | null)[];

const WEEKDAY_HOURS: DayHours = { opensAt: 7 * 60, closesAt: 19 * 60, lastStartAt: 18 * 60 };

/** Hétfő–péntek 07:00–19:00, utolsó kezdés 18:00, hétvégén zárva. */
export const DEFAULT_OPENING_HOURS: WeeklyOpeningHours = [
  WEEKDAY_HOURS,
  WEEKDAY_HOURS,
  WEEKDAY_HOURS,
  WEEKDAY_HOURS,
  WEEKDAY_HOURS,
  null,
  null,
];

export interface BookingRuleSettings {
  openingHours: WeeklyOpeningHours;
  /** A vendég legfeljebb ennyi nappal előre foglalhat (a mai nap + N. nap még foglalható). */
  maxAdvanceDays: number;
  /** Új online foglalás legalább ennyi perccel a kezdés előtt. */
  minLeadMinutes: number;
  /** Online módosítás és lemondás legalább ennyi órával a kezdés előtt. */
  changeCutoffHours: number;
  /** Várólistás ajánlat kizárólagos tartása percben. */
  holdMinutes: number;
  /** A kezdési időpontok rácsa percben (a nyitástól). */
  slotStepMinutes: number;
}

export const DEFAULT_BOOKING_SETTINGS: BookingRuleSettings = {
  openingHours: DEFAULT_OPENING_HOURS,
  maxAdvanceDays: 30,
  minLeadMinutes: 30,
  changeCutoffHours: 24,
  holdMinutes: 30,
  slotStepMinutes: 15,
};

/** A tárolt (JSON) heti nyitvatartás ellenőrzött alakja; hibás napnál a nap zárva. */
export function normalizeOpeningHours(value: unknown): WeeklyOpeningHours {
  if (!Array.isArray(value) || value.length !== 7) return DEFAULT_OPENING_HOURS;
  return value.map((day) => {
    if (!day || typeof day !== 'object') return null;
    const { opensAt, closesAt, lastStartAt } = day as Partial<DayHours>;
    if (
      typeof opensAt !== 'number' ||
      typeof closesAt !== 'number' ||
      !Number.isInteger(opensAt) ||
      !Number.isInteger(closesAt) ||
      opensAt < 0 ||
      closesAt > 24 * 60 ||
      opensAt >= closesAt
    ) {
      return null;
    }
    // Hibás vagy hiányzó utolsó kezdés: nincs külön korlát, csak a zárás.
    const validLastStart =
      typeof lastStartAt === 'number' &&
      Number.isInteger(lastStartAt) &&
      lastStartAt >= opensAt &&
      lastStartAt <= closesAt;
    return { opensAt, closesAt, lastStartAt: validLastStart ? lastStartAt : closesAt };
  });
}

/** A nap utolsó kezdési perce (a régi, utolsó kezdés nélküli beállításnál a zárás). */
export function lastStartOf(hours: DayHours): number {
  return hours.lastStartAt ?? hours.closesAt;
}

// ---------------------------------------------------------------------------
// Idő a stúdió időzónájában
// ---------------------------------------------------------------------------

const studioPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: STUDIO_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function studioParts(date: Date) {
  const parts = studioPartsFormatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    // Egyes motorok éjfélt „24”-ként adnak vissza.
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  };
}

/** A stúdió időzónájának eltolása UTC-hez percben (télen 60, nyáron 120). */
export function studioOffsetMinutes(date: Date): number {
  const p = studioParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - date.getTime()) / MINUTE_MS);
}

export function parseDayKey(dayKey: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) throw new Error(`Érvénytelen nap: ${dayKey}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function isDayKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const { year, month, day } = parseDayKey(value);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function formatUtcDayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function addDaysToDayKey(dayKey: string, days: number): string {
  const { year, month, day } = parseDayKey(dayKey);
  return formatUtcDayKey(Date.UTC(year, month - 1, day + days));
}

/** ISO hét napja: 1 = hétfő … 7 = vasárnap. */
export function studioWeekday(dayKey: string): number {
  const { year, month, day } = parseDayKey(dayKey);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

/** A hét hétfője (a heti nézethez). */
export function startOfStudioWeek(dayKey: string): string {
  return addDaysToDayKey(dayKey, 1 - studioWeekday(dayKey));
}

/** Napon belüli idő percben a stúdió időzónájában. */
export function studioMinutesOfDay(date: Date | string): number {
  const p = studioParts(new Date(date));
  return p.hour * 60 + p.minute;
}

/**
 * A stúdió helyi idejének (nap + perc) UTC időpontja, a nyári időszámítás váltását is kezelve.
 * A tavaszi váltáskor kimaradó órára (02:00–03:00) eső idő a váltás utáni időre esik.
 */
export function studioDateTime(dayKey: string, minutes: number): Date {
  const { year, month, day } = parseDayKey(dayKey);
  const naive = Date.UTC(year, month - 1, day, 0, minutes);
  const firstGuess = naive - studioOffsetMinutes(new Date(naive)) * MINUTE_MS;
  const offset = studioOffsetMinutes(new Date(firstGuess));
  return new Date(naive - offset * MINUTE_MS);
}

/** „HH:MM” → perc; hibás értéknél `null`. */
export function parseTimeOfDay(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes > 0)) return null;
  return hours * 60 + minutes;
}

export function formatTimeOfDay(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Magyar munkaszüneti napok
// ---------------------------------------------------------------------------

/** Húsvétvasárnap (Gergely-naptár, Meeus/Jones/Butcher algoritmus). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return formatUtcDayKey(Date.UTC(year, month - 1, day));
}

export interface PublicHoliday {
  dayKey: string;
  name: string;
}

const FIXED_HOLIDAYS: { monthDay: string; name: string; since?: number }[] = [
  { monthDay: '01-01', name: 'Újév' },
  { monthDay: '03-15', name: 'Nemzeti ünnep' },
  { monthDay: '05-01', name: 'A munka ünnepe' },
  { monthDay: '08-20', name: 'Az államalapítás ünnepe' },
  { monthDay: '10-23', name: 'Nemzeti ünnep' },
  { monthDay: '11-01', name: 'Mindenszentek' },
  // 2025-től munkaszüneti nap.
  { monthDay: '12-24', name: 'Szenteste', since: 2025 },
  { monthDay: '12-25', name: 'Karácsony' },
  { monthDay: '12-26', name: 'Karácsony másnapja' },
];

/**
 * A magyar munkaszüneti napok (Mt. 102. §), a húsvéthoz kötöttekkel együtt, dátum szerint.
 * Az évenkénti rendeletes áthelyezett pihenőnapokat nem tartalmazza: azokat a recepció
 * rendkívüli zárvatartásként rögzíti.
 */
export function hungarianPublicHolidays(year: number): PublicHoliday[] {
  const easter = easterSunday(year);
  const movable: PublicHoliday[] = [
    { dayKey: addDaysToDayKey(easter, -2), name: 'Nagypéntek' },
    { dayKey: easter, name: 'Húsvétvasárnap' },
    { dayKey: addDaysToDayKey(easter, 1), name: 'Húsvéthétfő' },
    { dayKey: addDaysToDayKey(easter, 49), name: 'Pünkösdvasárnap' },
    { dayKey: addDaysToDayKey(easter, 50), name: 'Pünkösdhétfő' },
  ];
  const fixed = FIXED_HOLIDAYS.filter((h) => !h.since || year >= h.since).map((h) => ({
    dayKey: `${year}-${h.monthDay}`,
    name: h.name,
  }));
  return [...fixed, ...movable].sort((a, b) => a.dayKey.localeCompare(b.dayKey));
}

const holidayCache = new Map<number, Map<string, string>>();

/** A nap munkaszüneti nap neve, vagy `null`. */
export function hungarianHolidayName(dayKey: string): string | null {
  const { year } = parseDayKey(dayKey);
  let byDay = holidayCache.get(year);
  if (!byDay) {
    byDay = new Map(hungarianPublicHolidays(year).map((h) => [h.dayKey, h.name]));
    holidayCache.set(year, byDay);
  }
  return byDay.get(dayKey) ?? null;
}

// ---------------------------------------------------------------------------
// Napi nyitvatartás
// ---------------------------------------------------------------------------

/** Recepciós felülírás egy napra: ünnepnapon nyitva, vagy egyébként zárva. */
export interface HolidayOverrideInput {
  dayKey: string;
  isOpen: boolean;
}

export type DayClosedReason = 'WEEKLY_CLOSED' | 'HOLIDAY' | 'OVERRIDE_CLOSED';

export interface ResolvedDayHours {
  hours: DayHours | null;
  closedReason: DayClosedReason | null;
  holidayName: string | null;
  overridden: boolean;
}

export function resolveDayHours(
  dayKey: string,
  settings: Pick<BookingRuleSettings, 'openingHours'>,
  overrides: readonly HolidayOverrideInput[] = [],
): ResolvedDayHours {
  const holidayName = hungarianHolidayName(dayKey);
  const weekly = settings.openingHours[studioWeekday(dayKey) - 1] ?? null;
  const override = overrides.find((o) => o.dayKey === dayKey);
  if (override) {
    return override.isOpen
      ? { hours: weekly ?? WEEKDAY_HOURS, closedReason: null, holidayName, overridden: true }
      : { hours: null, closedReason: 'OVERRIDE_CLOSED', holidayName, overridden: true };
  }
  if (holidayName) {
    return { hours: null, closedReason: 'HOLIDAY', holidayName, overridden: false };
  }
  if (!weekly) {
    return { hours: null, closedReason: 'WEEKLY_CLOSED', holidayName: null, overridden: false };
  }
  return { hours: weekly, closedReason: null, holidayName: null, overridden: false };
}

// ---------------------------------------------------------------------------
// Erőforrás, kezelés, foglaltság
// ---------------------------------------------------------------------------

export interface BookingResourceRule {
  id: string;
  /** Egyidejű kapacitás (fő). */
  capacity: number;
  isActive: boolean;
}

/** Beauty alap (TICKET-59): a kozmetikus erőforrása, egyszerre egy vendéggel. */
export const COSMETIC_RESOURCE_NAME = 'Kozmetikus 1';

/**
 * A kozmetikai kezelések (TICKET-59), a seed és a mock közös listája; az éles adatot a
 * `20261121100000_beauty_basics` migráció ugyanezzel a listával veszi fel. Szünet nélkül (a
 * 120 perc az előkészítést és az elpakolást is tartalmazza), egyelőre csak recepciós foglalással.
 */
export const COSMETIC_TREATMENTS: readonly { name: string; durationMinutes: number }[] = [
  { name: 'Fúziós plazma', durationMinutes: 120 },
  { name: 'Hollywood Peel', durationMinutes: 120 },
  { name: 'Hydrodermabrázió', durationMinutes: 120 },
  { name: 'Mikrodermabrázió', durationMinutes: 120 },
  { name: 'Dermapen', durationMinutes: 120 },
  { name: 'Tű nélküli mezoterápia', durationMinutes: 120 },
  { name: 'Rádiófrekvenciás arckezelés', durationMinutes: 120 },
  { name: 'Anti-aging arckezelés', durationMinutes: 120 },
  { name: 'Tisztító arckezelés', durationMinutes: 120 },
  { name: 'Arcmasszázs', durationMinutes: 60 },
  { name: 'Szemöldök-laminálás festéssel', durationMinutes: 60 },
  { name: 'Szempilla-lifting festéssel', durationMinutes: 60 },
  { name: 'Lézeres szőrtelenítés: hónalj', durationMinutes: 30 },
  { name: 'Lézeres szőrtelenítés: bikinivonal', durationMinutes: 30 },
  { name: 'Lézeres szőrtelenítés: lábszár', durationMinutes: 60 },
  { name: 'Lézeres szőrtelenítés: comb', durationMinutes: 60 },
  { name: 'Lézeres szőrtelenítés: teljes láb', durationMinutes: 60 },
  { name: 'Lézeres szőrtelenítés: teljes kar', durationMinutes: 60 },
  { name: 'Lézeres szőrtelenítés: hát', durationMinutes: 60 },
  { name: 'Lézeres szőrtelenítés: teljes intim', durationMinutes: 60 },
];

export interface BookableTreatmentRule {
  id: string;
  resourceId: string;
  durationMinutes: number;
  /** A kezelés utáni szünet; gépfoglaltság, a vendéget nem köti. */
  bufferMinutes: number;
  /** A többkezeléses foglalás sorrendje (kisebb előbb). */
  sortOrder: number;
}

/** Egy gépet foglaló tétel: foglalás vagy várólistás tartás. */
export interface OccupancyItem {
  /** Foglalás vagy tartás azonosítója (áthelyezésnél a saját tétel kizárásához). */
  refId: string;
  resourceId: string;
  startsAt: Date | string;
  /** A kezelés vége + a szünet. */
  blockedUntil: Date | string;
}

/** A vendég saját, nem lemondott kezelése (a szünet nélkül). */
export interface GuestBusyItem {
  refId: string;
  startsAt: Date | string;
  endsAt: Date | string;
}

/** Rendkívüli zárvatartás (`resourceId: null`) vagy gépenkénti letiltás. */
export interface ClosureInput {
  startsAt: Date | string;
  endsAt: Date | string;
  resourceId: string | null;
}

const ms = (value: Date | string) => new Date(value).getTime();

export function intervalsOverlap(
  aStart: Date | string,
  aEnd: Date | string,
  bStart: Date | string,
  bEnd: Date | string,
): boolean {
  return ms(aStart) < ms(bEnd) && ms(bStart) < ms(aEnd);
}

/**
 * A gép legnagyobb egyidejű foglaltsága a `[start, end)` időszakban. Az átfedő tételek közül a
 * csúcs valamelyik tétel kezdetén (vagy az időszak elején) van.
 */
export function peakConcurrency(
  items: readonly OccupancyItem[],
  resourceId: string,
  start: Date | string,
  end: Date | string,
  excludeRefIds: readonly string[] = [],
): number {
  const startMs = ms(start);
  const endMs = ms(end);
  const relevant = items.filter(
    (i) =>
      i.resourceId === resourceId &&
      !excludeRefIds.includes(i.refId) &&
      ms(i.startsAt) < endMs &&
      startMs < ms(i.blockedUntil),
  );
  const points = [startMs, ...relevant.map((i) => ms(i.startsAt)).filter((p) => p > startMs)];
  let peak = 0;
  for (const p of points) {
    const count = relevant.filter((i) => ms(i.startsAt) <= p && p < ms(i.blockedUntil)).length;
    if (count > peak) peak = count;
  }
  return peak;
}

export function isBlockedByClosure(
  closures: readonly ClosureInput[],
  resourceId: string | null,
  start: Date | string,
  end: Date | string,
): 'STUDIO' | 'RESOURCE' | null {
  let result: 'STUDIO' | 'RESOURCE' | null = null;
  for (const c of closures) {
    if (!intervalsOverlap(c.startsAt, c.endsAt, start, end)) continue;
    if (c.resourceId === null) return 'STUDIO';
    if (c.resourceId === resourceId) result = 'RESOURCE';
  }
  return result;
}

export interface BookingContext {
  settings: BookingRuleSettings;
  overrides: readonly HolidayOverrideInput[];
  closures: readonly ClosureInput[];
  occupancy: readonly OccupancyItem[];
  /** A vendég többi kezelése (önátfedés). */
  guestBusy?: readonly GuestBusyItem[];
}

export type PlacementError =
  | 'CLOSED'
  | 'OUTSIDE_OPENING_HOURS'
  | 'RESOURCE_BLOCKED'
  | 'CAPACITY_FULL'
  | 'GUEST_OVERLAP';

export interface PlannedItem {
  treatmentId: string;
  resourceId: string;
  startsAt: Date;
  endsAt: Date;
  blockedUntil: Date;
}

export function planItem(treatment: BookableTreatmentRule, startsAt: Date): PlannedItem {
  const endsAt = new Date(startsAt.getTime() + treatment.durationMinutes * MINUTE_MS);
  return {
    treatmentId: treatment.id,
    resourceId: treatment.resourceId,
    startsAt,
    endsAt,
    blockedUntil: new Date(endsAt.getTime() + treatment.bufferMinutes * MINUTE_MS),
  };
}

/**
 * Egy kezelés elhelyezhető-e: nyitvatartás (legkésőbb az utolsó kezdéskor indul, és a szünettel
 * együtt a zárásig véget ér), zárvatartás és gépletiltás,
 * kapacitás (a szünet is foglaltság), a vendég önátfedése. A kapacitás soha nem írható felül.
 */
export function checkPlacement(
  item: PlannedItem,
  resource: BookingResourceRule,
  ctx: BookingContext,
  excludeRefIds: readonly string[] = [],
): PlacementError | null {
  const dayKey = toStudioDayKey(item.startsAt);
  const day = resolveDayHours(dayKey, ctx.settings, ctx.overrides);
  if (!day.hours) return 'CLOSED';

  const startMinute = studioMinutesOfDay(item.startsAt);
  const blockedMinutes = Math.round((item.blockedUntil.getTime() - item.startsAt.getTime()) / MINUTE_MS);
  if (
    startMinute < day.hours.opensAt ||
    startMinute > lastStartOf(day.hours) ||
    startMinute + blockedMinutes > day.hours.closesAt
  ) {
    return 'OUTSIDE_OPENING_HOURS';
  }

  const closure = isBlockedByClosure(ctx.closures, resource.id, item.startsAt, item.blockedUntil);
  if (closure === 'STUDIO') return 'CLOSED';
  if (closure === 'RESOURCE' || !resource.isActive) return 'RESOURCE_BLOCKED';

  const peak = peakConcurrency(ctx.occupancy, resource.id, item.startsAt, item.blockedUntil, excludeRefIds);
  if (peak + 1 > resource.capacity) return 'CAPACITY_FULL';

  const overlap = (ctx.guestBusy ?? []).some(
    (b) => !excludeRefIds.includes(b.refId) && intervalsOverlap(b.startsAt, b.endsAt, item.startsAt, item.endsAt),
  );
  if (overlap) return 'GUEST_OVERLAP';
  return null;
}

// ---------------------------------------------------------------------------
// Foglalási időablak (30 nap / 30 perc / 24 óra)
// ---------------------------------------------------------------------------

export type BookingWindowError = 'IN_PAST' | 'TOO_LATE' | 'TOO_FAR';

/**
 * Új foglalás időablaka: legalább `minLeadMinutes` perccel előtte, legfeljebb `maxAdvanceDays`
 * nappal előre (naptári nap szerint). A recepció (`override`) mindhármat felülírhatja.
 */
export function checkBookingWindow(
  startsAt: Date | string,
  now: Date,
  settings: Pick<BookingRuleSettings, 'minLeadMinutes' | 'maxAdvanceDays'>,
  override = false,
): BookingWindowError | null {
  if (override) return null;
  const startMs = ms(startsAt);
  if (startMs <= now.getTime()) return 'IN_PAST';
  if (startMs - now.getTime() < settings.minLeadMinutes * MINUTE_MS) return 'TOO_LATE';
  const lastDay = addDaysToDayKey(toStudioDayKey(now), settings.maxAdvanceDays);
  if (toStudioDayKey(startsAt) > lastDay) return 'TOO_FAR';
  return null;
}

/** A helyben beengedés („Most kezdődik”) percrácsa. */
export const WALK_IN_ROUND_MINUTES = 5;

/**
 * Helyben beengedés kezdése: a mostani idő 5 percre lefelé kerekítve (a vendég már itt van). A
 * stúdió időzónájának eltolása egész óra, így az UTC szerinti kerekítés a helyi időre is áll.
 */
export function walkInStart(now: Date): Date {
  const step = WALK_IN_ROUND_MINUTES * MINUTE_MS;
  return new Date(Math.floor(now.getTime() / step) * step);
}

/** Online módosítás / lemondás: legalább `changeCutoffHours` órával a kezdés előtt. */
export function checkChangeWindow(
  startsAt: Date | string,
  now: Date,
  settings: Pick<BookingRuleSettings, 'changeCutoffHours'>,
  override = false,
): 'CHANGE_CUTOFF' | null {
  if (override) return null;
  return ms(startsAt) - now.getTime() < settings.changeCutoffHours * HOUR_MS ? 'CHANGE_CUTOFF' : null;
}

/** Eddig lehet online módosítani / lemondani. */
export function changeDeadline(
  startsAt: Date | string,
  settings: Pick<BookingRuleSettings, 'changeCutoffHours'>,
): Date {
  return new Date(ms(startsAt) - settings.changeCutoffHours * HOUR_MS);
}

// ---------------------------------------------------------------------------
// Többkezeléses keresés
// ---------------------------------------------------------------------------

/** A konfigurált kezelési sorrend (kisebb `sortOrder` előbb, egyezésnél az azonosító). */
export function orderTreatments<T extends BookableTreatmentRule>(treatments: readonly T[]): T[] {
  return [...treatments].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

/**
 * Egymást követő kezelések terve: a következő az előző végén kezdődik. Ha ugyanazon a gépen
 * folytatódik (pl. HIEMT után Intimpad), a gép szünete után.
 */
export function planSequence(
  orderedTreatments: readonly BookableTreatmentRule[],
  startsAt: Date,
): PlannedItem[] {
  const items: PlannedItem[] = [];
  let cursor = startsAt;
  for (const treatment of orderedTreatments) {
    const previous = items[items.length - 1];
    if (previous && previous.resourceId === treatment.resourceId) {
      cursor = previous.blockedUntil;
    }
    const item = planItem(treatment, cursor);
    items.push(item);
    cursor = item.endsAt;
  }
  return items;
}

export interface SequenceCheckFailure {
  index: number;
  error: PlacementError;
}

/** A terv minden eleme elhelyezhető-e; a korábbi elemek a későbbieknek már foglaltságot jelentenek. */
export function checkSequence(
  items: readonly PlannedItem[],
  resourcesById: ReadonlyMap<string, BookingResourceRule>,
  ctx: BookingContext,
  excludeRefIds: readonly string[] = [],
): SequenceCheckFailure | null {
  const occupancy: OccupancyItem[] = [...ctx.occupancy];
  const guestBusy: GuestBusyItem[] = [...(ctx.guestBusy ?? [])];
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const resource = resourcesById.get(item.resourceId);
    if (!resource) return { index, error: 'RESOURCE_BLOCKED' };
    const error = checkPlacement(item, resource, { ...ctx, occupancy, guestBusy }, excludeRefIds);
    if (error) return { index, error };
    const refId = `planned-${index}`;
    occupancy.push({ refId, resourceId: item.resourceId, startsAt: item.startsAt, blockedUntil: item.blockedUntil });
    guestBusy.push({ refId, startsAt: item.startsAt, endsAt: item.endsAt });
  }
  return null;
}

/** A tétel gépén még szabad helyek száma (a tétellel együtt számolt csúcs után). */
export function remainingCapacity(
  item: PlannedItem,
  resource: BookingResourceRule,
  occupancy: readonly OccupancyItem[],
  excludeRefIds: readonly string[] = [],
): number {
  return Math.max(
    0,
    resource.capacity - peakConcurrency(occupancy, resource.id, item.startsAt, item.blockedUntil, excludeRefIds),
  );
}

export interface SequenceSlot {
  startsAt: Date;
  endsAt: Date;
  items: PlannedItem[];
  /** A legszűkebb tétel szabad helyei (a foglalás előtt). */
  remaining: number;
}

export interface FindSlotsInput {
  dayKey: string;
  /** A választott kezelések (a sorrendet a függvény állítja be). */
  treatments: readonly BookableTreatmentRule[];
  resources: readonly BookingResourceRule[];
  ctx: BookingContext;
  now: Date;
  /** Recepció: a 30 napos és 30 perces korlát nélkül (a kapacitás marad). */
  override?: boolean;
  excludeRefIds?: readonly string[];
}

/**
 * Szabad kezdési időpontok egy napra: a kezdés a nyitástól a `slotStepMinutes` rácson, a
 * kezelések a konfigurált sorrendben egymás után. Csak az az időpont jelenik meg, ahol minden
 * kezelés elhelyezhető, és az első kezdés megfelel a foglalási időablaknak.
 */
export function findSequenceSlots(input: FindSlotsInput): SequenceSlot[] {
  const { dayKey, ctx, now } = input;
  if (input.treatments.length === 0) return [];
  const day = resolveDayHours(dayKey, ctx.settings, ctx.overrides);
  if (!day.hours) return [];

  const ordered = orderTreatments(input.treatments);
  const resourcesById = new Map(input.resources.map((r) => [r.id, r]));
  const step = Math.max(5, ctx.settings.slotStepMinutes);
  const slots: SequenceSlot[] = [];

  for (let minute = day.hours.opensAt; minute <= lastStartOf(day.hours); minute += step) {
    const startsAt = studioDateTime(dayKey, minute);
    // A tavaszi óraátállításkor kimaradó perc másik napra vagy időre esne.
    if (toStudioDayKey(startsAt) !== dayKey || studioMinutesOfDay(startsAt) !== minute) continue;
    if (checkBookingWindow(startsAt, now, ctx.settings, input.override)) continue;
    const items = planSequence(ordered, startsAt);
    if (checkSequence(items, resourcesById, ctx, input.excludeRefIds)) continue;
    const remaining = Math.min(
      ...items.map((item) =>
        remainingCapacity(item, resourcesById.get(item.resourceId)!, ctx.occupancy, input.excludeRefIds),
      ),
    );
    slots.push({ startsAt, endsAt: items[items.length - 1].endsAt, items, remaining });
  }
  return slots;
}

// ---------------------------------------------------------------------------
// Foglalási állapotok és bérlethasználat
// ---------------------------------------------------------------------------

export type BookingStatusValue = 'CONFIRMED' | 'LATE' | 'ARRIVED' | 'NO_SHOW' | 'CANCELLED';

export interface BookingTransition {
  allowed: boolean;
  /** Levonás kell (ha még nem történt). */
  deduct: boolean;
  /** A meglévő levonás visszavonása (állapot visszaállítása). */
  reverse: boolean;
}

const OPEN_STATUSES: BookingStatusValue[] = ['CONFIRMED', 'LATE'];
const DONE_STATUSES: BookingStatusValue[] = ['ARRIVED', 'NO_SHOW'];

/**
 * Az állapotváltás szabályai. Megérkezés vagy a recepciós által rögzített „Nem jelent meg”
 * levonással jár; az állapot visszaállítása (foglalt / késik) a levonást visszavonja. Lemondani
 * csak a még meg nem történt foglalást lehet; a lemondott foglalás végleges. Automatikus
 * „nem jelent meg” nincs: minden váltás recepciós művelet.
 */
export function bookingTransition(from: BookingStatusValue, to: BookingStatusValue): BookingTransition {
  const denied = { allowed: false, deduct: false, reverse: false };
  if (from === 'CANCELLED') return denied;
  if (to === 'CANCELLED') {
    return OPEN_STATUSES.includes(from) ? { allowed: true, deduct: false, reverse: false } : denied;
  }
  if (DONE_STATUSES.includes(to)) return { allowed: true, deduct: true, reverse: false };
  // to: CONFIRMED vagy LATE
  return { allowed: true, deduct: false, reverse: DONE_STATUSES.includes(from) };
}

export interface BookingPassInput extends PassStatusInput {
  id: string;
  /** A bérlet szolgáltatása (vagy a sablonjáé); `null` = bármely kezelésre. */
  serviceId?: string | null;
  womenOnly?: boolean | null;
}

/**
 * A levonáshoz használható bérlet: a kezelés szolgáltatására szól (vagy általános), a számolt
 * állapota aktív (lejárt, elfogyott, fagyasztott, még nem kezdődött nem), és a vendég neme
 * nem zárja ki. A szolgáltatáshoz kötött bérlet előbb, utána a leghamarabb lejáró.
 */
export function pickBookingPass<P extends BookingPassInput>(
  passes: readonly P[],
  serviceId: string | null,
  now: Date,
  guestGender?: Gender | string | null,
): P | null {
  const usable = passes.filter(
    (p) =>
      (serviceId ? passCoversService(p.serviceId, serviceId) : !p.serviceId) &&
      womenOnlyAccess(guestGender, p.womenOnly) !== 'DENIED' &&
      getPassStatus(p, now) === PassStatus.ACTIVE,
  );
  usable.sort(
    (a, b) =>
      Number(!a.serviceId) - Number(!b.serviceId) ||
      ms(a.expirationDate) - ms(b.expirationDate),
  );
  return usable[0] ?? null;
}

export type BookingPassWarning =
  | 'NO_PASS'
  | 'EXPIRED_PASS'
  | 'DEPLETED_PASS'
  | 'FROZEN_PASS'
  | 'NOT_ENOUGH_OCCASIONS';

export const BOOKING_PASS_WARNING_TEXT: Record<BookingPassWarning, string> = {
  NO_PASS: 'Nincs erre a kezelésre szóló bérlet. A díj vagy új bérlet a recepción rendezhető.',
  EXPIRED_PASS: 'A bérlet lejárt. Foglalni lehet, a rendezés a recepción történik.',
  DEPLETED_PASS: 'A bérleten nincs több alkalom. Új bérlet vagy egyszeri díj a recepción rendezhető.',
  FROZEN_PASS: 'A bérlet szünetel (fagyasztva). A rendezés a recepción történik.',
  NOT_ENOUGH_OCCASIONS:
    'Több a jövőbeli foglalás, mint a bérlet fennmaradó alkalma. A különbözet a recepción rendezhető.',
};

/**
 * Figyelmeztetés foglaláskor (a foglalást nem tiltja, levonás és tartozás nem keletkezik).
 * `upcomingCount`: a vendég nem lemondott, még le nem vont foglalásai erre a szolgáltatásra,
 * ezzel együtt.
 */
export function bookingPassWarning(
  passes: readonly BookingPassInput[],
  serviceId: string | null,
  upcomingCount: number,
  now: Date,
  guestGender?: Gender | string | null,
): BookingPassWarning | null {
  const covering = passes.filter(
    (p) =>
      !p.cancelledAt &&
      (serviceId ? passCoversService(p.serviceId, serviceId) : !p.serviceId) &&
      womenOnlyAccess(guestGender, p.womenOnly) !== 'DENIED',
  );
  const usable = covering.filter((p) => getPassStatus(p, now) === PassStatus.ACTIVE);
  if (usable.length === 0) {
    const statuses = covering.map((p) => getPassStatus(p, now));
    if (statuses.includes(PassStatus.FROZEN)) return 'FROZEN_PASS';
    if (statuses.includes(PassStatus.DEPLETED)) return 'DEPLETED_PASS';
    if (statuses.includes(PassStatus.EXPIRED)) return 'EXPIRED_PASS';
    return 'NO_PASS';
  }
  if (usable.some((p) => p.type === PassType.TIME_BASED)) return null;
  const remaining = usable.reduce((sum, p) => sum + Math.max(0, p.remainingPasses ?? 0), 0);
  return upcomingCount > remaining ? 'NOT_ENOUGH_OCCASIONS' : null;
}

/** A zárvatartás által érintett (nem lemondott) foglalások: csak jelzés, nem módosít. */
export function bookingsAffectedByClosure<
  B extends { resourceId: string; startsAt: Date | string; blockedUntil: Date | string; status: string },
>(bookings: readonly B[], closure: ClosureInput): B[] {
  return bookings.filter(
    (b) =>
      b.status !== 'CANCELLED' &&
      (closure.resourceId === null || closure.resourceId === b.resourceId) &&
      intervalsOverlap(b.startsAt, b.blockedUntil, closure.startsAt, closure.endsAt),
  );
}

/** A napok kulcsai `from`-tól `to`-ig (mindkettő benne). */
export function dayKeysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let key = from; key <= to && days.length < 366; key = addDaysToDayKey(key, 1)) {
    days.push(key);
  }
  return days;
}

/** Az időpont előtt ennyi időn belül esedékes az emlékeztető (24 óra). */
export const BOOKING_REMINDER_LEAD_MS = DAY_MS;
