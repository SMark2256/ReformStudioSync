import { MembershipDueStatus, MembershipStatus, OverdueBucket } from './enums';

/**
 * Havi tagdíj-esedékességek számítása a stúdió naptára (Europe/Budapest) szerint.
 * Tiszta függvények: az API és a kliensoldali mock motor ugyanezt használja.
 *
 * A `dueDate` dátum jellegű érték: az esedékesség napjának UTC éjfele
 * (pl. 2026-12-10T00:00:00.000Z). Olvasáskor mindig a budapesti naptári napot
 * nézzük, így a régebbi, helyi éjfélre mentett értékek is helyesen értelmeződnek.
 */

export const STUDIO_TIME_ZONE = 'Europe/Budapest';

const DAY_MS = 24 * 60 * 60 * 1000;

const budapestDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: STUDIO_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export interface CalendarDay {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
}

/** A megadott időpont naptári napja a stúdió időzónájában. */
export function getStudioDate(date: Date | string): CalendarDay {
  const parts = budapestDateFormat.formatToParts(new Date(date));
  const get = (type: 'year' | 'month' | 'day') =>
    Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** A budapesti naptári nap sorszáma (napok 1970-01-01 óta), napkülönbséghez. */
function dayNumber(date: Date | string): number {
  const { year, month, day } = getStudioDate(date);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Az esedékesség napja az adott hónapban; rövid hónapnál a hónap utolsó napja. */
function effectiveDueDay(year: number, month: number, dueDay: number): number {
  return Math.min(Math.max(1, dueDay), daysInMonth(year, month));
}

export function formatPeriod(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Az adott időszak (év, hónap) esedékességi dátuma. */
export function getDueDate(year: number, month: number, dueDay: number): Date {
  return new Date(
    Date.UTC(year, month - 1, effectiveDueDay(year, month, dueDay)),
  );
}

/** Hány naptári napja késik az esedékesség (az esedékesség napján még 0). */
export function getOverdueDays(
  dueDate: Date | string,
  now: Date = new Date(),
): number {
  return Math.max(0, dayNumber(now) - dayNumber(dueDate));
}

export function getOverdueBucket(overdueDays: number): OverdueBucket {
  if (overdueDays <= 0) return OverdueBucket.NONE;
  if (overdueDays <= 5) return OverdueBucket.DAYS_1_5;
  if (overdueDays <= 15) return OverdueBucket.DAYS_6_15;
  return OverdueBucket.DAYS_OVER_15;
}

export interface MembershipBillingInput {
  startDate: Date | string;
  dueDay: number;
  status: MembershipStatus;
  pausedAt?: Date | string | null;
  terminatedAt?: Date | string | null;
  /** Utolsó újraaktiválás ideje; a számlázás innen folytatódik. */
  resumedAt?: Date | string | null;
}

export interface ScheduledDue {
  /** YYYY-MM */
  period: string;
  dueDate: Date;
}

/**
 * Mely időszakoknak kell esedékességgel rendelkezniük `now` időpontig.
 *
 * - Kezdőpont: az utolsó újraaktiválás, ennek hiányában a kezdés napja. Ha ez a
 *   nap későbbi, mint a hónap esedékességi napja, az első esedékesség a következő
 *   hónapé, különben az adott hónapé.
 * - Időszakok a folyó budapesti hónapig (bezárólag), így a havi díj a hónap
 *   elejétől előre is befizethető.
 * - Szüneteltetett / megszűnt tagságnál csak a szünet / megszűnés napjáig (bezárólag)
 *   esedékes időszakok; dátum nélküli szünetnél egy sem. Szünet utáni megszűnésnél
 *   a szünet napja számít (a `pausedAt` ilyenkor megmarad).
 */
export function getMembershipDueSchedule(
  membership: MembershipBillingInput,
  now: Date = new Date(),
): ScheduledDue[] {
  const stopDate =
    membership.status === MembershipStatus.PAUSED
      ? (membership.pausedAt ?? null)
      : membership.status === MembershipStatus.TERMINATED
        ? (membership.pausedAt ?? membership.terminatedAt ?? null)
        : undefined;
  // Dátum nélküli szünet / megszűnés: nincs esedékes időszak.
  if (stopDate === null) return [];
  const lastDueDay = stopDate === undefined ? null : dayNumber(stopDate);

  const anchor = getStudioDate(membership.resumedAt ?? membership.startDate);
  let cursor = { year: anchor.year, month: anchor.month };
  if (anchor.day > effectiveDueDay(anchor.year, anchor.month, membership.dueDay)) {
    cursor = nextMonth(cursor);
  }

  const today = getStudioDate(now);
  const lastPeriod = formatPeriod(today.year, today.month);
  const schedule: ScheduledDue[] = [];

  for (;;) {
    const period = formatPeriod(cursor.year, cursor.month);
    if (period > lastPeriod) break;
    const dueDate = getDueDate(cursor.year, cursor.month, membership.dueDay);
    if (lastDueDay !== null && dayNumber(dueDate) > lastDueDay) break;
    schedule.push({ period, dueDate });
    cursor = nextMonth(cursor);
  }

  return schedule;
}

/**
 * A még létre nem hozott esedékességek. Csak a legutóbbi meglévő időszak utániak
 * számítanak: a pótlás minden státusz- és esedékességinap-váltás előtt lefut, így a
 * korábbi hiányok szándékosak (kihagyott kezdőhónap, szünet), nem pótolandók.
 * A folyó hónapnál későbbi, kézzel felvett időszak nem számít.
 */
export function getMissingDues(
  membership: MembershipBillingInput,
  existingPeriods: Iterable<string>,
  now: Date = new Date(),
): ScheduledDue[] {
  const today = getStudioDate(now);
  const currentPeriod = formatPeriod(today.year, today.month);
  let latest = '';
  for (const period of existingPeriods) {
    if (period <= currentPeriod && period > latest) latest = period;
  }
  return getMembershipDueSchedule(membership, now).filter(
    ({ period }) => period > latest,
  );
}

function nextMonth({ year, month }: { year: number; month: number }) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/**
 * Státuszváltáskor beállítandó időbélyegek. Szünet / megszűnés napja csak
 * valódi váltáskor íródik felül; újraaktiváláskor `resumedAt` = most.
 */
export function getMembershipStatusTimestamps(
  previous: {
    status: MembershipStatus;
    pausedAt?: Date | string | null;
    terminatedAt?: Date | string | null;
  },
  nextStatus: MembershipStatus,
  now: Date,
): { pausedAt: Date | null; terminatedAt: Date | null; resumedAt?: Date } {
  const statusChanged = previous.status !== nextStatus;
  const stamp = (current?: Date | string | null) =>
    statusChanged || !current ? now : new Date(current);
  return {
    // Szünet utáni megszűnésnél a szünet napja marad a számlázás vége.
    pausedAt:
      nextStatus === MembershipStatus.PAUSED
        ? stamp(previous.pausedAt)
        : nextStatus === MembershipStatus.TERMINATED &&
            previous.status === MembershipStatus.PAUSED &&
            previous.pausedAt
          ? new Date(previous.pausedAt)
          : null,
    terminatedAt:
      nextStatus === MembershipStatus.TERMINATED ? stamp(previous.terminatedAt) : null,
    ...(statusChanged && nextStatus === MembershipStatus.ACTIVE ? { resumedAt: now } : {}),
  };
}

/** Igaz, ha a státuszváltás leállítja a számlázást (szünet / megszűnés kezdete). */
export function stopsBilling(
  previousStatus: MembershipStatus,
  nextStatus: MembershipStatus,
): boolean {
  return previousStatus !== nextStatus && nextStatus !== MembershipStatus.ACTIVE;
}

/**
 * Szünet / megszűnés után törölhető-e egy (hónap elején előre létrehozott)
 * esedékesség: érintetlen, és a leállás napja után esedékes. A befizetéshez
 * rendelt esedékességeket a hívó szűri ki.
 */
export function isDueRemovableOnStop(
  due: { status: string; paidAmountHuf: number; dueDate: Date | string },
  stopDate: Date,
): boolean {
  return (
    due.status === MembershipDueStatus.PENDING &&
    due.paidAmountHuf === 0 &&
    dayNumber(due.dueDate) > dayNumber(stopDate)
  );
}
