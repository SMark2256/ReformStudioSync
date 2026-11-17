import { SequenceSlotDto } from '@reform/shared';
import React from 'react';
import { Button, Skeleton } from '@/shared/ui';
import { formatBookingTime } from '../model/format';

const optionClassName =
  'h-auto min-w-[84px] flex-col gap-0 px-3 py-1.5 coarse:h-auto coarse:min-h-11 aria-pressed:border-primary aria-pressed:bg-primary-soft';

interface SlotPickerProps {
  slots: SequenceSlotDto[] | undefined;
  loading?: boolean;
  /** A kiválasztott kezdés (ISO), üres szöveg, ha nincs. */
  value: string;
  onChange: (startsAt: string) => void;
  /** A szabad helyek száma (recepció); a nyilvános foglalón nem látszik. */
  showRemaining?: boolean;
  emptyText: string;
  label: string;
}

/** Szabad kezdési időpontok gombsorként (a kijelölt `aria-pressed`), mint a többi választó. */
export const SlotPicker: React.FC<SlotPickerProps> = ({
  slots,
  loading = false,
  value,
  onChange,
  showRemaining = false,
  emptyText,
  label,
}) => {
  if (loading) {
    return (
      <div className="flex flex-wrap gap-1.5" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-[84px]" />
        ))}
      </div>
    );
  }
  if (!slots || slots.length === 0) {
    return <p className="text-[13px] text-muted-foreground">{emptyText}</p>;
  }
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {slots.map((slot) => {
        const time = formatBookingTime(slot.startsAt);
        const end = formatBookingTime(slot.endsAt);
        return (
          <Button
            key={slot.startsAt}
            variant="secondary"
            aria-pressed={slot.startsAt === value}
            aria-label={`${time}–${end}${showRemaining ? `, ${slot.remaining} szabad hely` : ''}`}
            onClick={() => onChange(slot.startsAt)}
            className={optionClassName}
          >
            <span className="text-[13px] font-semibold tabular-nums text-foreground">{time}</span>
            {showRemaining && (
              <span className="text-xs font-normal text-muted-foreground">{slot.remaining} hely</span>
            )}
          </Button>
        );
      })}
    </div>
  );
};
