import {
  EXPIRING_SOON_THRESHOLD_DAYS,
  GuestDto,
  GuestPassDto,
  MembershipStatus,
  PassStatus,
  PassType,
} from '@reform/shared';
import type { BadgeProps } from '@/shared/ui';

type BadgeVariant = NonNullable<BadgeProps['variant']>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A számolt bérletállapot (`GuestPassDto.status`) jelvénye. */
export const PASS_STATUS_BADGE: Record<
  PassStatus,
  { label: string; variant: BadgeVariant }
> = {
  [PassStatus.ACTIVE]: { label: 'Érvényes', variant: 'success' },
  [PassStatus.FROZEN]: { label: 'Fagyasztva', variant: 'secondary' },
  [PassStatus.NOT_STARTED]: { label: 'Még nem kezdődött', variant: 'warning' },
  [PassStatus.EXPIRED]: { label: 'Lejárt', variant: 'destructive' },
  [PassStatus.DEPLETED]: { label: 'Nincs alkalom', variant: 'destructive' },
  [PassStatus.CANCELLED]: { label: 'Sztornózva', variant: 'secondary' },
};

export const MEMBERSHIP_STATUS_LABEL: Record<MembershipStatus, string> = {
  [MembershipStatus.ACTIVE]: 'Aktív',
  [MembershipStatus.PAUSED]: 'Szüneteltetve',
  [MembershipStatus.TERMINATED]: 'Megszűnt',
};

/** A vendéglista szűrője (Vendégek oldal, UI-specifikáció 6.4). */
export type GuestPassFilter = 'all' | 'valid' | 'expiring' | 'expired';

export interface GuestPassSummary {
  /** A listában mutatott bérlet: az elsőként lejáró érvényes, különben a fagyasztott. */
  pass: GuestPassDto | null;
  /** A további használható (érvényes vagy fagyasztott) bérletek száma. */
  otherPassCount: number;
  badge: { label: string; variant: BadgeVariant };
  /** Melyik szűrőben látszik a „Mind” mellett; `null`: csak a „Mind” alatt. */
  filter: Exclude<GuestPassFilter, 'all'> | null;
}

function getRemainingPasses(pass: GuestPassDto): number | null {
  return pass.calculatedRemainingPasses ?? pass.remainingPasses;
}

/** „8 / 10” alkalom, időalapú bérletnél „Korlátlan”. */
export function formatRemainingPasses(pass: GuestPassDto): string {
  if (pass.type === PassType.TIME_BASED) return 'Korlátlan';
  return `${getRemainingPasses(pass) ?? 0} / ${pass.totalPasses ?? 0}`;
}

function isExpiringSoon(pass: GuestPassDto, now: number): boolean {
  const daysLeft = Math.ceil(
    (new Date(pass.expirationDate).getTime() - now) / DAY_MS,
  );
  if (daysLeft <= EXPIRING_SOON_THRESHOLD_DAYS) return true;
  return (
    pass.type !== PassType.TIME_BASED && (getRemainingPasses(pass) ?? 0) <= 1
  );
}

/**
 * A vendég bérletállapota egy sorban (UI-specifikáció 7.1). A számolt `status` az irányadó:
 * a lejárt, elfogyott, sztornózott bérlet nem használható, a fagyasztott igen.
 */
export function getGuestPassSummary(
  guest: GuestDto,
  now = Date.now(),
): GuestPassSummary {
  const passes = guest.passes ?? [];
  const usable = passes
    .filter(
      (p) => p.status === PassStatus.ACTIVE || p.status === PassStatus.FROZEN,
    )
    .sort(
      (a, b) =>
        Number(a.status === PassStatus.FROZEN) -
          Number(b.status === PassStatus.FROZEN) ||
        a.expirationDate.localeCompare(b.expirationDate),
    );
  const pass = usable[0] ?? null;
  const otherPassCount = Math.max(usable.length - 1, 0);
  const summary = (
    badge: GuestPassSummary['badge'],
    filter: GuestPassSummary['filter'],
  ): GuestPassSummary => ({ pass, otherPassCount, badge, filter });

  if (pass?.status === PassStatus.ACTIVE) {
    return isExpiringSoon(pass, now)
      ? summary({ label: 'Hamarosan lejár', variant: 'warning' }, 'expiring')
      : summary(PASS_STATUS_BADGE[PassStatus.ACTIVE], 'valid');
  }
  if (pass) return summary(PASS_STATUS_BADGE[PassStatus.FROZEN], 'valid');
  if (
    (guest.memberships ?? []).some((m) => m.status === MembershipStatus.ACTIVE)
  ) {
    return summary({ label: 'Aktív tagság', variant: 'success' }, 'valid');
  }
  const ended = passes.find(
    (p) => p.status === PassStatus.EXPIRED || p.status === PassStatus.DEPLETED,
  );
  return ended
    ? summary(PASS_STATUS_BADGE[ended.status], 'expired')
    : summary({ label: 'Nincs aktív bérlet', variant: 'secondary' }, null);
}

/** Rövid dátum: „nov. 29.”, más évben „2027. jan. 4.” (UI-specifikáció 7.2). */
export function formatShortDate(iso: string, now = new Date()): string {
  const date = new Date(iso);
  return date.toLocaleDateString('hu-HU', {
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
