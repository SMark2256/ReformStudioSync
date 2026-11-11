import { MonitorEventMode, ServiceCategory } from './enums';

/** A szolgáltatás jellege, ami az üdvözlés szövegét meghatározza (TICKET-43). Nem érzékeny adat. */
export interface GreetingService {
  category?: ServiceCategory | string | null;
  womenOnly?: boolean | null;
}

export interface ServiceGreeting {
  /** A szolgáltatás rövid neve a recepción („Köredzés”, „Női Köredzés”, „Kezelés”, „Kozmetika”). */
  kind: string;
  /** Címke a vendégmonitor fejlécén („Kozmetika • Üdvözlés”). */
  label: string;
  /** Jókívánság a vendégnek („Kellemes kikapcsolódást kívánunk!”). */
  wish: string;
}

/**
 * Közös szövegtérkép a vendégmonitornak, a recepciós toastnak és a „Utoljára azonosított vendég”
 * kártyának. A „Női” csak a csak nőknek szóló köredzésnél jelenik meg.
 */
export function greetingFor({ category, womenOnly }: GreetingService): ServiceGreeting {
  switch (category) {
    case ServiceCategory.CIRCUIT: {
      const kind = womenOnly ? 'Női Köredzés' : 'Köredzés';
      return { kind, label: `${kind} • Érkezés`, wish: 'Jó edzést kívánunk!' };
    }
    case ServiceCategory.BODY_SHAPING:
      return {
        kind: 'Kezelés',
        label: 'Kezelés • Üdvözlés',
        wish: 'Kellemes kezelést kívánunk!',
      };
    case ServiceCategory.COSMETIC:
      return {
        kind: 'Kozmetika',
        label: 'Kozmetika • Üdvözlés',
        wish: 'Kellemes kikapcsolódást kívánunk!',
      };
    default:
      return {
        kind: 'Alkalom',
        label: 'Üdvözlés',
        wish: 'Kellemes időtöltést kívánunk!',
      };
  }
}

/**
 * Üdvözlés egy beléptetési eseményhez (recepciós vagy monitor payload). Ha a payloadban nincs
 * kategória (`undefined`, pl. régebbi API-tól érkező esemény), a `mode` dönt a korábbi működés
 * szerint; a kifejezetten ismeretlen (`null`) kategória semleges szöveget ad.
 */
export function greetingForCheckIn(payload: {
  mode?: MonitorEventMode;
  serviceCategory?: ServiceCategory | null;
  womenOnly?: boolean;
}): ServiceGreeting {
  const category =
    payload.serviceCategory !== undefined
      ? payload.serviceCategory
      : payload.mode === 'CIRCUIT_GREETING'
        ? ServiceCategory.CIRCUIT
        : payload.mode === 'TREATMENT_GREETING'
          ? ServiceCategory.BODY_SHAPING
          : null;
  return greetingFor({ category, womenOnly: payload.womenOnly });
}

/**
 * A payloadba kerülő üdvözlési mezők egy szolgáltatásból. Szolgáltatás nélkül a `fallbackCategory`
 * (pl. köredzéses érkezésnél CIRCUIT), egyébként `null` — ismeretlen.
 */
export function greetingFields(
  service: GreetingService | null | undefined,
  fallbackCategory: ServiceCategory | null = null,
): { serviceCategory: ServiceCategory | null; womenOnly: boolean } {
  const category = service?.category;
  return {
    serviceCategory:
      category && (Object.values(ServiceCategory) as string[]).includes(category)
        ? (category as ServiceCategory)
        : fallbackCategory,
    womenOnly: !!service?.womenOnly,
  };
}
