import { GuestDto } from '@reform/shared';
import React, { useId, useState } from 'react';
import { Button, Label, SearchInput } from '@/shared/ui';
import { matchesGuestSearch } from '../model/guestSearch';

// Ennyi találat látszik egyszerre; a többihez pontosítani kell a keresést.
const MAX_VISIBLE_GUESTS = 6;

// Választható elem, mint a modálok többi választója: `secondary` gomb, a kijelölt `aria-pressed`.
const optionClassName =
  'h-auto w-full whitespace-normal coarse:h-auto coarse:min-h-11 aria-pressed:border-primary aria-pressed:bg-primary-soft flex-col items-start gap-0.5 px-3 py-2 text-left';

interface GuestPickerProps {
  guests: GuestDto[];
  /** A kiválasztott vendég azonosítója, üres szöveg, ha nincs kiválasztva. */
  value: string;
  onChange: (guestId: string) => void;
  /** Kiegészítő adat a találat soron (pl. az aktív bérletek száma). */
  describeGuest?: (guest: GuestDto) => string;
  invalid?: boolean;
  /** A kereső alatti hiba- vagy segítő szöveg azonosítója. */
  describedBy?: string;
}

/**
 * Kereshető vendégválasztó a modálokba (TICKET-4): név, vonalkód vagy telefonszám alapján szűr,
 * a kiválasztott vendég mindig a lista elején marad.
 */
export const GuestPicker: React.FC<GuestPickerProps> = ({
  guests,
  value,
  onChange,
  describeGuest,
  invalid = false,
  describedBy,
}) => {
  const fieldId = useId();
  const [search, setSearch] = useState('');

  const selectedGuest = guests.find((g) => g.id === value) ?? null;
  const matches = guests.filter(
    (g) => g.id !== value && matchesGuestSearch(g, search),
  );
  const visible = [
    ...(selectedGuest ? [selectedGuest] : []),
    ...matches.slice(0, MAX_VISIBLE_GUESTS - (selectedGuest ? 1 : 0)),
  ];
  const hiddenCount = matches.length + (selectedGuest ? 1 : 0) - visible.length;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${fieldId}-search`}>Vendég</Label>
      <SearchInput
        id={`${fieldId}-search`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Név, vonalkód vagy telefonszám"
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className="md:w-full xl:w-full"
      />
      <div
        role="group"
        aria-label="Vendég találatok"
        className="grid grid-cols-1 gap-1.5 sm:grid-cols-2"
      >
        {visible.map((g) => {
          const extra = describeGuest?.(g);
          return (
            <Button
              key={g.id}
              variant="secondary"
              aria-pressed={g.id === value}
              onClick={() => onChange(g.id)}
              className={optionClassName}
            >
              <span className="text-[13px] font-semibold text-foreground">
                {g.lastName} {g.firstName}
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                #{g.barcode}
                {g.phone ? `, ${g.phone}` : ''}
                {extra ? `, ${extra}` : ''}
              </span>
            </Button>
          );
        })}
      </div>
      <p aria-live="polite" className="text-xs text-muted-foreground empty:hidden">
        {visible.length === 0
          ? 'Nincs ilyen vendég. Keress névre, vonalkódra vagy telefonszámra.'
          : hiddenCount > 0
            ? `További ${hiddenCount} vendég, pontosítsd a keresést.`
            : ''}
      </p>
    </div>
  );
};
