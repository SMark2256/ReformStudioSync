import { studioDateTime } from '@reform/shared';
import { describe, expect, it } from 'vitest';
import {
  assignLanes,
  PX_PER_MINUTE,
  shiftDay,
  timeTicks,
  verticalBox,
  visibleRange,
  weekDayKeys,
} from './calendarLayout';

const DAY = '2026-11-18';
const at = (minutes: number) => studioDateTime(DAY, minutes).toISOString();
const item = (id: string, start: number, blockedUntil: number) => ({ id, startsAt: at(start), blockedUntil: at(blockedUntil) });

/** TICKET-57: a recepciós foglalási naptár elrendezése (tiszta logika). */
describe('foglalási naptár elrendezése', () => {
  it('a kapacitásnak megfelelő párhuzamos sávok; a szünet is foglaltság', () => {
    const { placed, lanes } = assignLanes(
      [item('a', 540, 575), item('b', 540, 575), item('c', 570, 605), item('d', 575, 610)],
      3,
    );
    expect(lanes).toBe(3);
    expect(Object.fromEntries(placed.map((p) => [p.item.id, p.lane]))).toEqual({ a: 0, b: 1, c: 2, d: 0 });
  });

  it('túlfoglalásnál új sáv jelenik meg (a hiba látható marad)', () => {
    const { lanes } = assignLanes([item('a', 540, 575), item('b', 550, 585)], 1);
    expect(lanes).toBe(2);
  });

  it('az időtartomány a nyitvatartásból, zárt napokon az alapértelmezés', () => {
    expect(
      visibleRange([
        { dayKey: DAY, hours: { opensAt: 480, closesAt: 1020 }, closedReason: null, holidayName: null },
        { dayKey: '2026-11-19', hours: { opensAt: 420, closesAt: 960 }, closedReason: null, holidayName: null },
      ]),
    ).toEqual({ start: 420, end: 1020 });
    expect(visibleRange([{ dayKey: DAY, hours: null, closedReason: 'HOLIDAY', holidayName: 'Ünnep' }])).toEqual({
      start: 420,
      end: 1080,
    });
  });

  it('félórás jelölések és a tétel helye képpontban', () => {
    expect(timeTicks({ start: 420, end: 540 })).toEqual([420, 450, 480, 510, 540]);
    expect(verticalBox(at(450), at(480), DAY, { start: 420, end: 1080 })).toEqual({
      top: 30 * PX_PER_MINUTE,
      height: 30 * PX_PER_MINUTE,
    });
  });

  it('heti nézet: hétfőtől, a zárt hétvége nélkül; lapozás napra és hétre', () => {
    expect(weekDayKeys(DAY)).toHaveLength(7);
    expect(weekDayKeys(DAY, [])).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']);
    expect(shiftDay(DAY, 'day', 1)).toBe('2026-11-19');
    expect(shiftDay(DAY, 'week', -1)).toBe('2026-11-11');
  });
});
