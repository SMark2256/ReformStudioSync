import {
  passCoversService,
  ServiceDto,
  TreatmentSelectionOption,
} from '@reform/shared';

export interface TreatmentPreselection {
  passId?: string;
  serviceId?: string;
}

/**
 * Beolvasás utáni előválasztás a kezelésválasztóban (TICKET-39): ha egyetlen bérlet jöhet szóba,
 * az ki van jelölve, és ha arra egyetlen aktív kezelés vonható le, az is.
 */
export function getTreatmentPreselection(
  options: readonly TreatmentSelectionOption[],
  services: readonly ServiceDto[],
): TreatmentPreselection {
  if (options.length !== 1) return {};
  const [option] = options;
  const coveredServices = services.filter(
    (s) => s.isActive && passCoversService(option.serviceId, s.id),
  );
  return {
    passId: option.passId,
    serviceId: coveredServices.length === 1 ? coveredServices[0].id : undefined,
  };
}
