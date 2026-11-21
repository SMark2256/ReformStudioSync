import {
  BookingCalendarDto,
  BookingDto,
  BookingStatus,
  DAY_CLOSED_REASON_LABELS,
  formatTimeOfDay,
  toStudioDayKey,
} from '@reform/shared';
import { AlertTriangle } from 'lucide-react';
import React from 'react';
import { bookingStatusLabel, formatBookingTime, formatDayKey } from '@/entities/booking';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui';
import { assignLanes, PX_PER_MINUTE, timeTicks, verticalBox, visibleRange } from '../model/calendarLayout';

const LANE_MIN_WIDTH = 120;

const STATUS_CLASS: Record<BookingStatus, string> = {
  [BookingStatus.CONFIRMED]: 'border-primary/40 bg-primary/10',
  [BookingStatus.LATE]: 'border-warning/50 bg-warning/10',
  [BookingStatus.ARRIVED]: 'border-success/50 bg-success/10',
  [BookingStatus.NO_SHOW]: 'border-destructive/50 bg-destructive/10',
  [BookingStatus.CANCELLED]: 'border-border bg-muted',
};

export interface CalendarColumn {
  key: string;
  label: string;
  sublabel?: string;
  dayKey: string;
  resourceId: string;
  capacity: number;
}

interface BookingCalendarProps {
  data: BookingCalendarDto;
  columns: CalendarColumn[];
  onOpenBooking: (booking: BookingDto) => void;
}

/**
 * Saját foglalási naptár (TICKET-57): oszloponként egy gép egy napon, a gép kapacitásának
 * megfelelő párhuzamos sávokkal. A kezelés utáni szünet halvány sávként látszik (gépfoglaltság),
 * a zárvatartás és a várólistás tartás külön jelölve.
 */
export const BookingCalendar: React.FC<BookingCalendarProps> = ({ data, columns, onOpenBooking }) => {
  const range = visibleRange(data.days);
  const height = (range.end - range.start) * PX_PER_MINUTE;
  const ticks = timeTicks(range);

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max">
        {/* Időtengely */}
        <div className="sticky left-0 z-10 w-14 shrink-0 bg-card" aria-hidden="true">
          <div className="h-12 border-b border-border" />
          <div className="relative" style={{ height }}>
            {ticks.map((minute) => (
              <span
                key={minute}
                className="absolute right-2 -translate-y-1/2 text-xs tabular-nums text-muted-foreground"
                style={{ top: (minute - range.start) * PX_PER_MINUTE }}
              >
                {minute % 60 === 0 ? formatTimeOfDay(minute) : ''}
              </span>
            ))}
          </div>
        </div>

        {columns.map((column) => (
          <CalendarColumnView
            key={column.key}
            column={column}
            data={data}
            range={range}
            height={height}
            ticks={ticks}
            onOpenBooking={onOpenBooking}
          />
        ))}
      </div>
    </div>
  );
};

interface ColumnViewProps {
  column: CalendarColumn;
  data: BookingCalendarDto;
  range: { start: number; end: number };
  height: number;
  ticks: number[];
  onOpenBooking: (booking: BookingDto) => void;
}

const CalendarColumnView: React.FC<ColumnViewProps> = ({ column, data, range, height, ticks, onOpenBooking }) => {
  const day = data.days.find((d) => d.dayKey === column.dayKey);
  const bookings = data.bookings.filter(
    (b) => b.resourceId === column.resourceId && toStudioDayKey(b.startsAt) === column.dayKey,
  );
  const { placed, lanes } = assignLanes(bookings, column.capacity);
  const laneWidth = 100 / lanes;
  const closures = data.closures.filter(
    (c) =>
      (c.resourceId === null || c.resourceId === column.resourceId) &&
      toStudioDayKey(c.startsAt) <= column.dayKey &&
      toStudioDayKey(c.endsAt) >= column.dayKey,
  );
  const holds = data.holds.filter(
    (h) => h.resourceId === column.resourceId && toStudioDayKey(h.startsAt) === column.dayKey,
  );
  const resourceInactive = data.resources.find((r) => r.id === column.resourceId)?.isActive === false;

  return (
    <section
      aria-label={`${column.label}${column.sublabel ? `, ${column.sublabel}` : ''}`}
      className="min-w-0 flex-1 border-l border-border"
      style={{ minWidth: lanes * LANE_MIN_WIDTH }}
    >
      <div className="flex h-12 flex-col justify-center border-b border-border px-2">
        <h3 className="truncate text-[13px] font-semibold text-foreground">{column.label}</h3>
        {column.sublabel && <p className="truncate text-xs text-muted-foreground">{column.sublabel}</p>}
      </div>
      <div className="relative" style={{ height }}>
        {ticks.map((minute) => (
          <div
            key={minute}
            aria-hidden="true"
            className={cn('absolute inset-x-0 border-t', minute % 60 === 0 ? 'border-border' : 'border-border/50')}
            style={{ top: (minute - range.start) * PX_PER_MINUTE }}
          />
        ))}

        {(!day?.hours || resourceInactive) && (
          <div className="absolute inset-0 flex items-start justify-center bg-muted/70 p-3 text-center text-xs text-muted-foreground">
            {resourceInactive
              ? 'Le van tiltva'
              : day?.holidayName
                ? `${day.holidayName} (munkaszüneti nap)`
                : day?.closedReason
                  ? DAY_CLOSED_REASON_LABELS[day.closedReason]
                  : 'Zárva'}
          </div>
        )}
        {day?.hours && day.hours.opensAt > range.start && (
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 bg-muted/70"
            style={{ height: (day.hours.opensAt - range.start) * PX_PER_MINUTE }}
          />
        )}
        {day?.hours && day.hours.closesAt < range.end && (
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 bg-muted/70"
            style={{ height: (range.end - day.hours.closesAt) * PX_PER_MINUTE }}
          />
        )}

        {closures.map((c) => {
          const box = verticalBox(c.startsAt, c.endsAt, column.dayKey, range);
          return (
            <div
              key={c.id}
              className="absolute inset-x-0 border-y border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive"
              style={box}
            >
              {c.resourceId ? 'Gép letiltva' : 'Rendkívüli zárvatartás'}
              {c.reason ? `: ${c.reason}` : ''}
            </div>
          );
        })}

        {holds.map((h) => {
          const box = verticalBox(h.startsAt, h.blockedUntil, column.dayKey, range);
          return (
            <div
              key={h.waitlistEntryId}
              className="absolute right-1 rounded-md border border-dashed border-warning/60 bg-warning/10 px-1.5 py-1 text-xs text-foreground"
              style={{ ...box, left: 4 }}
            >
              <span className="font-semibold">Tartás:</span> {h.guestName} ({h.treatmentName}), {formatBookingTime(h.expiresAt)}-ig
            </div>
          );
        })}

        {placed.map(({ item: booking, lane }) => {
          const box = verticalBox(booking.startsAt, booking.endsAt, column.dayKey, range);
          const buffer = verticalBox(booking.endsAt, booking.blockedUntil, column.dayKey, range);
          const time = `${formatBookingTime(booking.startsAt)}–${formatBookingTime(booking.endsAt)}`;
          const status = bookingStatusLabel(booking.status);
          const style = { left: `calc(${lane * laneWidth}% + 2px)`, width: `calc(${laneWidth}% - 4px)` };
          return (
            <React.Fragment key={booking.id}>
              <div
                aria-hidden="true"
                className="absolute rounded-b-sm bg-muted"
                style={{ ...style, top: buffer.top, height: buffer.height }}
              />
              <Button
                variant="secondary"
                aria-label={`${booking.guestName}, ${booking.treatmentName}, ${time}, ${status}`}
                onClick={() => onOpenBooking(booking)}
                className={cn(
                  'absolute h-auto min-h-0 flex-col items-start justify-start gap-0 overflow-hidden whitespace-normal px-1.5 py-1 text-left text-xs font-normal shadow-none coarse:h-auto',
                  STATUS_CLASS[booking.status],
                  booking.status === BookingStatus.NO_SHOW && 'opacity-80',
                )}
                style={{ ...style, top: box.top, height: Math.max(box.height, 18) }}
              >
                <span className="flex w-full items-center gap-1 font-semibold text-foreground">
                  <span className="truncate">{booking.guestName}</span>
                  {booking.passWarning && <AlertTriangle aria-hidden="true" className="!size-3 shrink-0 text-warning" />}
                </span>
                <span className="w-full truncate text-muted-foreground">
                  {time} · {booking.treatmentName}
                </span>
                {booking.status !== BookingStatus.CONFIRMED && (
                  <span className="w-full truncate font-medium text-foreground">{status}</span>
                )}
              </Button>
            </React.Fragment>
          );
        })}
      </div>
    </section>
  );
};

/** A napi nézet oszlopai: minden gép egy oszlop. */
export function dayColumns(data: BookingCalendarDto, dayKey: string): CalendarColumn[] {
  return data.resources.map((r) => ({
    key: `${dayKey}:${r.id}`,
    label: r.name,
    sublabel: `${r.capacity} fő egyszerre`,
    dayKey,
    resourceId: r.id,
    capacity: r.capacity,
  }));
}

/** A heti (gépenkénti) nézet oszlopai: egy gép a hét napjain. */
export function weekColumns(data: BookingCalendarDto, resourceId: string, dayKeys: string[]): CalendarColumn[] {
  const resource = data.resources.find((r) => r.id === resourceId);
  if (!resource) return [];
  return dayKeys.map((dayKey) => ({
    key: `${dayKey}:${resourceId}`,
    label: formatDayKey(dayKey),
    sublabel: resource.name,
    dayKey,
    resourceId,
    capacity: resource.capacity,
  }));
}
