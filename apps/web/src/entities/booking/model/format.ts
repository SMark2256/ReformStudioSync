import {
  BOOKING_PASS_WARNING_TEXT,
  BOOKING_STATUS_LABELS,
  BookingPassWarning,
  BookingStatus,
  BookingStatusValue,
  formatTimeOfDay,
  type UpdateBookingStatusResponseDto,
  parseDayKey,
  STUDIO_TIME_ZONE,
  studioMinutesOfDay,
} from '@reform/shared';
import type { BadgeProps } from '@/shared/ui';

/** A foglalási lekérdezések közös gyökere: a valós idejű jelzés ezt frissíti. */
export const BOOKING_QUERY_KEYS = {
  all: ['bookings'] as const,
  calendar: (from: string, to: string) => ['bookings', 'calendar', from, to] as const,
  availability: (key: unknown) => ['bookings', 'availability', key] as const,
  settings: ['bookings', 'settings'] as const,
  waitlist: ['bookings', 'waitlist'] as const,
  sync: ['bookings', 'sync'] as const,
  audit: (id: string) => ['bookings', 'audit', id] as const,
};

export const BOOKING_STATUS_BADGE: Record<BookingStatus, NonNullable<BadgeProps['variant']>> = {
  [BookingStatus.CONFIRMED]: 'secondary',
  [BookingStatus.LATE]: 'warning',
  [BookingStatus.ARRIVED]: 'success',
  [BookingStatus.NO_SHOW]: 'destructive',
  [BookingStatus.CANCELLED]: 'secondary',
};

export const bookingStatusLabel = (status: BookingStatus): string => BOOKING_STATUS_LABELS[status as string as BookingStatusValue];

export const passWarningText = (warning: BookingPassWarning): string => BOOKING_PASS_WARNING_TEXT[warning];

/** Mi történt a bérlettel az állapotváltáskor (a toast leírása). */
export function deductionText(
  result: Pick<UpdateBookingStatusResponseDto, 'deduction' | 'passName' | 'remainingPasses'>,
): string | undefined {
  switch (result.deduction) {
    case 'DEDUCTED':
      return result.passName
        ? `1 alkalom levonva: ${result.passName}${result.remainingPasses !== null ? `, maradt: ${result.remainingPasses}` : ''}.`
        : '1 alkalom levonva.';
    case 'ALREADY_DEDUCTED':
      return 'A levonás már megtörtént, nem vontunk le újra.';
    case 'LINKED_EXISTING':
      return 'A mai levonáshoz kapcsolva, nem vontunk le újra.';
    case 'NO_USABLE_PASS':
      return 'Nincs felhasználható bérlet: levonás és tartozás nélkül rögzítve.';
    case 'REVERSED':
      return 'A levonás visszavonva.';
    default:
      return undefined;
  }
}

/** „09:30” a stúdió időzónájában. */
export const formatBookingTime = (iso: string): string => formatTimeOfDay(studioMinutesOfDay(iso));

const WEEKDAYS = ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat'];
const MONTHS = ['jan.', 'febr.', 'márc.', 'ápr.', 'máj.', 'jún.', 'júl.', 'aug.', 'szept.', 'okt.', 'nov.', 'dec.'];

/** „nov. 18., szerda” (UI-specifikáció 7.2). */
export function formatDayKey(dayKey: string, withWeekday = true): string {
  const { year, month, day } = parseDayKey(dayKey);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${MONTHS[month - 1]} ${day}.${withWeekday ? `, ${weekday}` : ''}`;
}

/** „nov. 18., szerda, 09:30” egy időpontra. */
export function formatBookingMoment(iso: string): string {
  const dayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: STUDIO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
  return `${formatDayKey(dayKey)}, ${formatBookingTime(iso)}`;
}

/** A naptár- és űrlapmezők „ÓÓ:PP” értéke percből. */
export const minutesToTimeInput = (minutes: number): string => formatTimeOfDay(minutes);
