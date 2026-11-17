import { Injectable, Optional } from '@nestjs/common';
import { BookingChangeKind, toStudioDayKey } from '@reform/shared';
import { MonitorGateway } from '../monitor/monitor.gateway';

/**
 * A recepciós naptár valós idejű frissítése (TICKET-57, `booking:changed`). Csak a commit után
 * hívjuk, és csak a napokat küldjük, személyes adatot nem: a naptár ezekre újratölt.
 */
@Injectable()
export class BookingEvents {
  constructor(@Optional() private readonly gateway?: MonitorGateway) {}

  changed(studioId: string, kind: BookingChangeKind, dates: readonly (Date | string)[] = []): void {
    const dayKeys = [
      ...new Set(dates.map((d) => (typeof d === 'string' && d.length === 10 ? d : toStudioDayKey(d)))),
    ];
    this.gateway?.emitBookingChanged({
      studioId,
      kind,
      dayKeys,
      timestamp: new Date().toISOString(),
    });
  }
}
