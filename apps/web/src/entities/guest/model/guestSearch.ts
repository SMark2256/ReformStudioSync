import { GuestDto } from '@reform/shared';

const digitsOf = (value: string) => value.replace(/\D/g, '');

/**
 * Vendégkeresés a modálok vendégválasztójához (TICKET-4): név (mindkét sorrendben), vonalkód
 * vagy telefonszám. A telefonszámot számjegyekre bontva hasonlítjuk, így a „30 123” is
 * megtalálja a „+36 30 123 4567”-et.
 */
export const matchesGuestSearch = (guest: GuestDto, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (
    `${guest.lastName} ${guest.firstName}`.toLowerCase().includes(q) ||
    `${guest.firstName} ${guest.lastName}`.toLowerCase().includes(q) ||
    guest.barcode.toLowerCase().includes(q)
  ) {
    return true;
  }
  const qDigits = digitsOf(q);
  return (
    !!guest.phone &&
    qDigits.length >= 3 &&
    digitsOf(guest.phone).includes(qDigits)
  );
};
