import type { AuthUserDto, MeasurementDto } from './contracts';
import { Role } from './enums';

/**
 * Mérés törlése (TICKET-8): adminisztrátor bármelyiket, más munkatárs csak a saját maga által
 * rögzítettet törölheti. Az API, a kliensoldali mock motor és a felület is ezt használja.
 */
export function canDeleteMeasurement(
  user: Pick<AuthUserDto, 'id' | 'role'> | null | undefined,
  measurement: Pick<MeasurementDto, 'recordedById'>,
): boolean {
  if (!user) return false;
  if (user.role === Role.ADMIN) return true;
  return measurement.recordedById !== null && measurement.recordedById === user.id;
}
