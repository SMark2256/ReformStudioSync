import {
  CheckInStatus,
  GUEST_ARRIVALS_LIMIT,
  GuestArrivalDto,
} from '@reform/shared';
import { ChevronDown, ChevronUp } from 'lucide-react';
import React, { useId, useState } from 'react';
import { cn } from '@/shared/lib/utils';
import { Badge, Button } from '@/shared/ui';
import {
  ARRIVAL_STATUS_BADGE,
  ARRIVALS_PAGE_SIZE,
  arrivalTitle,
  formatArrivalDateTime,
} from '../model/arrivals';

/** Egy belépés sora: fajta és szolgáltatás, bérlet, időpont, rögzítő, állapot (és ok). */
const ArrivalRow: React.FC<{ arrival: GuestArrivalDto; showPass: boolean }> = ({
  arrival,
  showPass,
}) => {
  const badge = ARRIVAL_STATUS_BADGE[arrival.status];
  const isVoided = arrival.status === CheckInStatus.CANCELLED;
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 text-[13px]">
      <div className="min-w-0">
        <p className={cn(isVoided && 'text-muted-foreground line-through')}>
          <span className="font-medium">{arrivalTitle(arrival)}</span>
          {showPass && arrival.passName && (
            <span className="text-muted-foreground"> · {arrival.passName}</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          <time dateTime={arrival.occurredAt}>
            {formatArrivalDateTime(arrival.occurredAt)}
          </time>{' '}
          · Rögzítette: {arrival.staffName}
        </p>
        {arrival.reason && (
          <p className="text-xs text-muted-foreground">
            {/* A sztornó oka önmagát magyarázza („Recepciós sztornó: …”, „Levonás visszavonva: …”). */}
            {arrival.status === CheckInStatus.DENIED
              ? `Elutasítás oka: ${arrival.reason}`
              : arrival.reason}
          </p>
        )}
      </div>
      <Badge variant={badge.variant}>{badge.label}</Badge>
    </li>
  );
};

/** Belépések listája, lapozás helyett „Továbbiak” bővítéssel. */
const ArrivalList: React.FC<{
  arrivals: readonly GuestArrivalDto[];
  label: string;
  showPass: boolean;
}> = ({ arrivals, label, showPass }) => {
  const [visibleCount, setVisibleCount] = useState(ARRIVALS_PAGE_SIZE);
  const hidden = arrivals.length - visibleCount;
  return (
    <div className="space-y-2">
      <ul
        aria-label={label}
        className="divide-y divide-border rounded-md border border-border"
      >
        {arrivals.slice(0, visibleCount).map((a) => (
          <ArrivalRow key={a.id} arrival={a} showPass={showPass} />
        ))}
      </ul>
      {hidden > 0 && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setVisibleCount((n) => n + ARRIVALS_PAGE_SIZE)}
        >
          Továbbiak ({hidden})
        </Button>
      )}
    </div>
  );
};

/** A vendég összes belépése (TICKET-40): sikeres, sztornózott és elutasított, legújabb elöl. */
export const GuestArrivalsSection: React.FC<{
  arrivals: readonly GuestArrivalDto[];
}> = ({ arrivals }) => {
  const titleId = useId();
  return (
    <section className="space-y-3" aria-labelledby={titleId}>
      <h3 id={titleId} className="text-[13px] font-semibold text-foreground">
        Belépések
      </h3>
      {arrivals.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          Még nincs rögzített belépés ennél a vendégnél.
        </p>
      ) : (
        <>
          <ArrivalList arrivals={arrivals} label="Belépések" showPass />
          {arrivals.length >= GUEST_ARRIVALS_LIMIT && (
            <p className="text-xs text-muted-foreground">
              A legutóbbi {GUEST_ARRIVALS_LIMIT} belépés látszik.
            </p>
          )}
        </>
      )}
    </section>
  );
};

/** Egy bérlet belépései a Bérletek fülön, lenyitható listában. */
export const PassArrivals: React.FC<{
  arrivals: readonly GuestArrivalDto[];
  passName: string;
}> = ({ arrivals, passName }) => {
  const [isOpen, setIsOpen] = useState(false);
  const listId = useId();
  if (arrivals.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Ezzel a bérlettel még nem volt belépés.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        size="sm"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-label={`${passName}: belépések (${arrivals.length})`}
        onClick={() => setIsOpen((open) => !open)}
      >
        {isOpen ? (
          <ChevronUp aria-hidden strokeWidth={1.75} />
        ) : (
          <ChevronDown aria-hidden strokeWidth={1.75} />
        )}
        Belépések ({arrivals.length})
      </Button>
      <div id={listId} hidden={!isOpen}>
        {isOpen && (
          <ArrivalList
            arrivals={arrivals}
            label={`${passName}: belépések`}
            showPass={false}
          />
        )}
      </div>
    </div>
  );
};
