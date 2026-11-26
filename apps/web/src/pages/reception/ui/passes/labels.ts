import { PassType, ServiceCategory } from '@reform/shared';

export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  [ServiceCategory.BODY_SHAPING]: 'Alakformáló kezelés',
  [ServiceCategory.COSMETIC]: 'Kozmetikai kezelés',
  [ServiceCategory.CIRCUIT]: 'Női köredzés',
};

export const PASS_TYPE_LABELS: Record<PassType, string> = {
  [PassType.OCCASION_BASED]: 'Alkalom alapú',
  [PassType.TIME_BASED]: 'Időkorlátos, korlátlan',
  [PassType.DAY_TICKET]: 'Napijegy',
};

/** A napijegy érvényessége a sablonlistán és az űrlapon (a lejáratot eladáskor a szerver számolja). */
export const DAY_TICKET_VALIDITY_LABEL = 'Vásárlás napján zárásig';
export const DAY_TICKET_FORM_HINT =
  'Egy alkalom, a vásárlás napján zárásig érvényes. A zárás a Foglalások › Beállítások nyitvatartásából jön; zárt napon a nap végéig érvényes.';
