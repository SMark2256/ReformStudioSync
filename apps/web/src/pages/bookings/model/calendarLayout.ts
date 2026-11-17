import {
  addDaysToDayKey,
  BookingDayDto,
  startOfStudioWeek,
  studioMinutesOfDay,
  toStudioDayKey,
} from '@reform/shared';

/** A naptár függőleges léptéke: ennyi képpont egy perc. */
export const PX_PER_MINUTE = 1.2;
const DEFAULT_RANGE = { start: 7 * 60, end: 18 * 60 };

export interface TimedItem {
  startsAt: string;
  /** A kezelés vége + a gép szünete (a sáv eddig foglalt). */
  blockedUntil: string;
}

export interface LanedItem<T> {
  item: T;
  /** 0-tól; a gép kapacitásánál nagyobb sáv túlfoglalást jelez. */
  lane: number;
}

/**
 * Sávkiosztás egy géposzlopon: a kapacitásnak megfelelő számú sáv, és minden tétel az első
 * szabad sávba kerül (a szünet is foglaltság). Így a 3 fős Hypoxi három párhuzamos sávot kap.
 */
export function assignLanes<T extends TimedItem>(items: readonly T[], laneCount: number): {
  placed: LanedItem<T>[];
  lanes: number;
} {
  const sorted = [...items].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
  const laneEnds: number[] = Array.from({ length: Math.max(1, laneCount) }, () => -Infinity);
  const placed = sorted.map((item) => {
    const start = new Date(item.startsAt).getTime();
    let lane = laneEnds.findIndex((end) => end <= start);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(-Infinity);
    }
    laneEnds[lane] = new Date(item.blockedUntil).getTime();
    return { item, lane };
  });
  return { placed, lanes: laneEnds.length };
}

/** A megjelenített időtartomány percben: a napok legkorábbi nyitása és legkésőbbi zárása. */
export function visibleRange(days: readonly BookingDayDto[]): { start: number; end: number } {
  const open = days.flatMap((d) => (d.hours ? [d.hours] : []));
  if (open.length === 0) return DEFAULT_RANGE;
  return {
    start: Math.min(...open.map((h) => h.opensAt)),
    end: Math.max(...open.map((h) => h.closesAt)),
  };
}

/** Az időtengely jelölései (alapból félóránként). */
export function timeTicks(range: { start: number; end: number }, step = 30): number[] {
  const ticks: number[] = [];
  const first = Math.ceil(range.start / step) * step;
  for (let minute = first; minute <= range.end; minute += step) ticks.push(minute);
  return ticks;
}

/** Egy tétel helye és magassága (képpont) a napon belül; a napon túllógó rész le van vágva. */
export function verticalBox(
  startsAt: string,
  endsAt: string,
  dayKey: string,
  range: { start: number; end: number },
): { top: number; height: number } {
  const startMinute = toStudioDayKey(startsAt) < dayKey ? range.start : studioMinutesOfDay(startsAt);
  const endMinute = toStudioDayKey(endsAt) > dayKey ? range.end : studioMinutesOfDay(endsAt);
  const top = Math.max(0, startMinute - range.start);
  const bottom = Math.min(range.end, endMinute) - range.start;
  return { top: top * PX_PER_MINUTE, height: Math.max(0, bottom - top) * PX_PER_MINUTE };
}

/** A heti nézet napjai: hétfőtől péntekig, a hétvége csak ha nyitva van. */
export function weekDayKeys(dayKey: string, days?: readonly BookingDayDto[]): string[] {
  const monday = startOfStudioWeek(dayKey);
  const all = Array.from({ length: 7 }, (_, i) => addDaysToDayKey(monday, i));
  if (!days) return all;
  return all.filter((key, index) => index < 5 || Boolean(days.find((d) => d.dayKey === key)?.hours));
}

export function shiftDay(dayKey: string, view: 'day' | 'week', direction: -1 | 1): string {
  return addDaysToDayKey(dayKey, direction * (view === 'week' ? 7 : 1));
}
