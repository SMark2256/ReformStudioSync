import {
  formatTimeOfDay,
  isDayKey,
  parseTimeOfDay,
  studioDateTime,
  studioMinutesOfDay,
  toStudioDayKey,
} from '@reform/shared';

/** `datetime-local` mező értéke (stúdióidő) → ISO; hibás értéknél `null`. */
export function localInputToIso(value: string): string | null {
  const [dayKey, time] = value.split('T');
  const minutes = time ? parseTimeOfDay(time.slice(0, 5)) : null;
  if (!isDayKey(dayKey) || minutes === null) return null;
  return studioDateTime(dayKey, minutes).toISOString();
}

/** ISO → `datetime-local` mező értéke a stúdió időzónájában. */
export function isoToLocalInput(iso: string): string {
  return `${toStudioDayKey(iso)}T${formatTimeOfDay(studioMinutesOfDay(iso))}`;
}

export const studioToday = (): string => toStudioDayKey(new Date());
