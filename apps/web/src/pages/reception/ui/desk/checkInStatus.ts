import { CheckInStatus } from '@reform/shared';
import type { BadgeProps } from '@/shared/ui';

// A beléptetés állapotának jelvénye (UI-specifikáció 5.7): mindig szöveggel.
export const CHECK_IN_STATUS_BADGES: Record<
  CheckInStatus,
  { variant: BadgeProps['variant']; label: string }
> = {
  [CheckInStatus.SUCCESS]: { variant: 'success', label: 'Sikeres' },
  [CheckInStatus.DUPLICATE_SCAN]: { variant: 'warning', label: 'Dupla leolvasás' },
  [CheckInStatus.DENIED]: { variant: 'destructive', label: 'Elutasítva' },
  [CheckInStatus.CANCELLED]: { variant: 'secondary', label: 'Visszavonva' },
};
