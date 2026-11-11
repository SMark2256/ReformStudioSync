import { CheckInStatus, CheckInWarningCode, MonitorEventMode } from './enums';
import type { CheckInResultPayload, CheckInRevokedPayload } from './socket-events';

export type MonitorCheckInStatus = 'SUCCESS' | 'DUPLICATE' | 'DENIED';

/** A monitoron megjeleníthető figyelmeztetések (a vendég saját alkalomszáma). */
const MONITOR_SAFE_WARNINGS = [
  'LAST_OCCASION',
  'LOW_OCCASIONS',
] as const satisfies readonly CheckInWarningCode[];

export type MonitorSafeWarning = (typeof MONITOR_SAFE_WARNINGS)[number];

/**
 * Vendégmonitor (/monitor, BroadcastChannel, monitor socket) számára szűkített
 * beléptetési esemény.
 *
 * ADATVÉDELMI SZABÁLY: ide soha nem kerülhet tartozás (összeg, napok), vonalkód,
 * vendég- vagy beléptetés-azonosító, elutasítási ok, illetve az `OVERDUE_DUES`
 * figyelmeztetés. Elutasításnál a név sem: a monitor csak semleges üzenetet mutat.
 * Új mezőt csak a `toMonitorPayload` függvényen keresztül szabad hozzáadni.
 */
export interface MonitorCheckInPayload {
  status: MonitorCheckInStatus;
  mode?: MonitorEventMode;
  /** Csak üdvözlésnél (SUCCESS / DUPLICATE); elutasításnál hiányzik. */
  displayName?: string;
  /** Csak kezelés-üdvözlésnél (TREATMENT_GREETING). */
  serviceName?: string;
  /** Csak kezelés-üdvözlésnél (TREATMENT_GREETING). */
  remainingPasses?: number | 'Korlátlan';
  /** Kezelés-üdvözlésen kívül mindig üres. */
  warnings: MonitorSafeWarning[];
  greetingSeconds?: number;
  timestamp: string;
}

/** Sztornó a monitoron: név és egyenleg nélkül. */
export interface MonitorCheckInRevokedPayload {
  timestamp: string;
}

function toMonitorStatus(status: CheckInStatus): MonitorCheckInStatus {
  if (status === CheckInStatus.SUCCESS) return 'SUCCESS';
  if (status === CheckInStatus.DUPLICATE_SCAN) return 'DUPLICATE';
  return 'DENIED';
}

/**
 * A teljes (recepciós) beléptetési eredményből a monitorra küldhető, szűkített
 * payload. Allowlist: csak a felsorolt mezők kerülnek át.
 */
export function toMonitorPayload(
  result: CheckInResultPayload,
): MonitorCheckInPayload {
  const status = toMonitorStatus(result.status);
  const base: MonitorCheckInPayload = {
    status,
    mode: result.mode,
    warnings: [],
    greetingSeconds: result.greetingSeconds,
    timestamp: result.timestamp,
  };
  if (status === 'DENIED') return base;

  base.displayName = result.guestName;
  if (result.mode === 'TREATMENT_GREETING') {
    base.serviceName = result.serviceName ?? result.passName;
    base.remainingPasses = result.remainingPasses;
    base.warnings = result.warnings.filter((w): w is MonitorSafeWarning =>
      (MONITOR_SAFE_WARNINGS as readonly CheckInWarningCode[]).includes(w),
    );
  }
  return base;
}

export function toMonitorRevokedPayload(
  revoked: CheckInRevokedPayload,
): MonitorCheckInRevokedPayload {
  return { timestamp: revoked.timestamp };
}
