import type { GuestArrivalDto, GuestArrivalStatus } from './contracts';
import { CheckInStatus, VisitType } from './enums';

/**
 * A vendégadatlap belépés-listája (TICKET-40). Tiszta függvény: az API és a kliensoldali mock
 * motor ugyanezzel képezi le a beléptetési naplót, így a kettő azonos választ ad.
 */

/** Ennyi legutóbbi belépés jön a vendég adataival. */
export const GUEST_ARRIVALS_LIMIT = 100;

/** Bérlet nélküli sikeres vagy sztornózott köredzés: havi tagsággal történt. */
export const MEMBERSHIP_ARRIVAL_PASS_NAME = 'Havi köredzés tagság';

const LISTED_STATUSES: ReadonlySet<string> = new Set<GuestArrivalStatus>([
  CheckInStatus.SUCCESS,
  CheckInStatus.CANCELLED,
  CheckInStatus.DENIED,
]);

/** Egy beléptetési napló sora, a kapcsolt bérlettel és levonással feloldva. */
export interface GuestArrivalSource {
  id: string;
  createdAt: Date | string;
  visitType: VisitType | `${VisitType}`;
  status: CheckInStatus | `${CheckInStatus}`;
  reason: string | null;
  guestPassId: string | null;
  /** A bérlet sablonjának neve, ha a belépés bérlethez kötődik. */
  passName: string | null;
  /** A belépéshez tartozó levonás szolgáltatása (kezelés). */
  usageServiceName: string | null;
  /** A bérlet szolgáltatása (szolgáltatáshoz kötött bérletnél). */
  passServiceName: string | null;
  staffName: string | null;
}

/**
 * Napló → belépés-lista: csak a sikeres, sztornózott és elutasított sorok (a dupla beolvasás nem
 * belépés), legújabb elöl, legfeljebb `limit` darab.
 */
export function toGuestArrivals(
  sources: readonly GuestArrivalSource[],
  limit = GUEST_ARRIVALS_LIMIT,
): GuestArrivalDto[] {
  return sources
    .filter((s) => LISTED_STATUSES.has(s.status))
    .map((s): GuestArrivalDto => {
      const status = s.status as GuestArrivalStatus;
      const visitType = s.visitType as VisitType;
      const viaMembership =
        status !== CheckInStatus.DENIED &&
        visitType === VisitType.CIRCUIT_TRAINING &&
        !s.guestPassId;
      return {
        id: s.id,
        occurredAt: new Date(s.createdAt).toISOString(),
        visitType,
        // Elutasításnál a napló a legutóbbi bérletet jegyzi, de szolgáltatás nem történt.
        serviceName:
          status === CheckInStatus.DENIED
            ? null
            : ((visitType === VisitType.TREATMENT ? s.usageServiceName : null) ??
              s.passServiceName ??
              null),
        guestPassId: s.guestPassId,
        passName:
          s.passName ?? (viaMembership ? MEMBERSHIP_ARRIVAL_PASS_NAME : null),
        staffName: s.staffName ?? 'Recepciós Munkatárs',
        status,
        reason: status === CheckInStatus.SUCCESS ? null : s.reason,
      };
    })
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, limit);
}
