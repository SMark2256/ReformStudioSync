import { PassType, ServiceCategory } from '@reform/shared';

export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  [ServiceCategory.BODY_SHAPING]: 'Alakformáló kezelés',
  [ServiceCategory.COSMETIC]: 'Kozmetikai kezelés',
  [ServiceCategory.CIRCUIT]: 'Női köredzés',
};

export const PASS_TYPE_LABELS: Record<PassType, string> = {
  [PassType.OCCASION_BASED]: 'Alkalom alapú',
  [PassType.TIME_BASED]: 'Időkorlátos, korlátlan',
};
