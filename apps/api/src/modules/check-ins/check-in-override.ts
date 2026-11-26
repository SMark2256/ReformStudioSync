import { Prisma } from '@prisma/client';
import {
  appError,
  checkInOverrideAuditDetails,
  CheckInOverrideRequestDto,
  EntryDebt,
  EntryDueInput,
  normalizeOverrideReason,
  summarizePassDebts,
} from '@reform/shared';
import { logCorrection } from '../passes/pass-ledger';
import { passDebtOf } from '../passes/pass-debt';

/**
 * Tartozás miatti tiltás és kivételes beengedés (TICKET-15) a szerveren: a közös szabály
 * (`resolveCheckInAccess`, `evaluateEntryDebt`) bemenete, az indoklás ellenőrzése és az audit.
 */

type Tx = Prisma.TransactionClient;

interface GuestWithDebts {
  memberships?: { dues?: EntryDueInput[] | null }[] | null;
  /** Hiányzik, ha nem töltöttük be (pl. tesztben): ekkor nincs bérlet-hátralék. */
  passes?: (Parameters<typeof passDebtOf>[0] & { createdAt?: Date | null })[] | null;
}

/** A tagdíjak és a bérletek hátraléka, a vásárlás napjával (a türelmi idő onnan számít). */
export function entryDebtInput(guest: GuestWithDebts) {
  return {
    dues: (guest.memberships ?? []).flatMap((m) => m.dues ?? []),
    passDebts: (guest.passes ?? []).map((p) => ({
      purchasedAt: p.createdAt,
      debtStatus: passDebtOf(p).status,
    })),
  };
}

/** A vendég ismert bérlet-hátraléka összesen (Ft), az elutasítás szövegéhez. */
export function guestPassDebtHuf(guest: GuestWithDebts): number {
  return summarizePassDebts(
    (guest.passes ?? []).map((p) => ({ debt: passDebtOf(p) })),
  ).debtHuf;
}

/**
 * A kivételes beengedés indoklása: `forceOverride` nélkül `null`, üres indoklással 400.
 * A kérés feldolgozása előtt fut, így indoklás nélkül semmi nem rögzül.
 */
export function requireOverrideReason(
  dto: CheckInOverrideRequestDto,
): string | null {
  if (!dto.forceOverride) return null;
  const reason = normalizeOverrideReason(dto.overrideReason);
  if (!reason) throw appError('CHECKIN.OVERRIDE_REASON_REQUIRED');
  return reason;
}

/** `CHECKIN_OVERRIDE` audit: ki (userId), mikor (createdAt), melyik vendég, melyik ok, indoklás. */
export function logCheckInOverride(
  tx: Tx,
  data: {
    studioId: string;
    staffUserId: string;
    checkInId: string;
    guestId: string;
    guestName: string;
    debt: EntryDebt;
    passDebtHuf: number;
    reason: string;
  },
) {
  return logCorrection(tx, {
    studioId: data.studioId,
    staffUserId: data.staffUserId,
    action: 'CHECKIN_OVERRIDE',
    entityType: 'LoggedCheckIn',
    entityId: data.checkInId,
    details: checkInOverrideAuditDetails(data),
  });
}
