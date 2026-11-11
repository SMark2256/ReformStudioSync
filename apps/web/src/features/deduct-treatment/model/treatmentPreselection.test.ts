import {
  PassType,
  ServiceCategory,
  ServiceDto,
  TreatmentSelectionOption,
} from '@reform/shared';
import { describe, expect, it } from 'vitest';
import { getTreatmentPreselection } from './treatmentPreselection';

const service = (id: string, isActive = true): ServiceDto => ({
  id,
  studioId: 'default-studio',
  name: id,
  category: ServiceCategory.BODY_SHAPING,
  durationMinutes: 30,
  priceHuf: 9500,
  isActive,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const option = (
  passId: string,
  serviceId: string | null,
): TreatmentSelectionOption => ({
  passId,
  passName: passId,
  passType: PassType.OCCASION_BASED,
  serviceId,
  serviceName: serviceId,
  remainingPasses: 8,
  expirationDate: '2026-12-31T00:00:00.000Z',
});

const services = [service('srv-hypoxi'), service('srv-facial'), service('srv-old', false)];

describe('getTreatmentPreselection (TICKET-39)', () => {
  it('egyetlen, kezeléshez kötött bérletnél a bérlet és a kezelés is előre kiválasztva', () => {
    expect(
      getTreatmentPreselection([option('pass-hypoxi', 'srv-hypoxi')], services),
    ).toEqual({ passId: 'pass-hypoxi', serviceId: 'srv-hypoxi' });
  });

  it('egyetlen, bármely kezelésre szóló bérletnél csak a bérlet (több aktív kezelés jöhet szóba)', () => {
    expect(getTreatmentPreselection([option('pass-open', null)], services)).toEqual({
      passId: 'pass-open',
      serviceId: undefined,
    });
  });

  it('egyetlen, bármely kezelésre szóló bérlet és egyetlen aktív kezelés: mindkettő kiválasztva', () => {
    expect(
      getTreatmentPreselection(
        [option('pass-open', null)],
        [service('srv-hypoxi'), service('srv-old', false)],
      ),
    ).toEqual({ passId: 'pass-open', serviceId: 'srv-hypoxi' });
  });

  it('több bérletnél nincs előválasztás', () => {
    expect(
      getTreatmentPreselection(
        [option('pass-a', 'srv-hypoxi'), option('pass-b', 'srv-facial')],
        services,
      ),
    ).toEqual({});
  });
});
