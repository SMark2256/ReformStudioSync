import {
  CheckInStatus,
  GuestArrivalDto,
  GuestArrivalStatus,
  STUDIO_TIME_ZONE,
  VisitType,
} from '@reform/shared';
import type { BadgeProps } from '@/shared/ui';

type BadgeVariant = NonNullable<BadgeProps['variant']>;

/** Ennyi belépés látszik elsőre; a „Továbbiak” ennyivel bővíti a listát. */
export const ARRIVALS_PAGE_SIZE = 10;

/** A belépés állapotának jelvénye (UI-specifikáció 5.7). */
export const ARRIVAL_STATUS_BADGE: Record<
  GuestArrivalStatus,
  { label: string; variant: BadgeVariant }
> = {
  [CheckInStatus.SUCCESS]: { label: 'Sikeres', variant: 'success' },
  [CheckInStatus.CANCELLED]: { label: 'Sztornózva', variant: 'secondary' },
  [CheckInStatus.DENIED]: { label: 'Elutasítva', variant: 'destructive' },
};

/** „Köredzés” vagy „Kezelés · Hypoxi”: a belépés fajtája, a szolgáltatással, ha más a neve. */
export function arrivalTitle(arrival: GuestArrivalDto): string {
  const kind =
    arrival.visitType === VisitType.TREATMENT ? 'Kezelés' : 'Köredzés';
  const service = arrival.serviceName?.trim();
  return service && service.toLowerCase() !== kind.toLowerCase()
    ? `${kind} · ${service}`
    : kind;
}

/** Az adott bérlethez kötött belépések (a lista sorrendjében). */
export function arrivalsForPass(
  arrivals: readonly GuestArrivalDto[] | undefined,
  passId: string,
): GuestArrivalDto[] {
  return (arrivals ?? []).filter((a) => a.guestPassId === passId);
}

const arrivalDateTimeFormat = new Intl.DateTimeFormat('hu-HU', {
  timeZone: STUDIO_TIME_ZONE,
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Időpont a stúdió időzónájában (Europe/Budapest), pl. „2026. nov. 10. 14:52”. */
export function formatArrivalDateTime(iso: string): string {
  return arrivalDateTimeFormat.format(new Date(iso));
}
