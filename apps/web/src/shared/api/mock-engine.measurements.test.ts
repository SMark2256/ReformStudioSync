import { Role } from '@reform/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockStudioEngine } from './mock-engine';

const errorOf = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return null;
};

const admin = { id: 'admin-1', name: 'Admin', role: Role.ADMIN };
const recorder = { id: 'staff-1', name: 'Kiss Réka', role: Role.RECEPTIONIST };
const otherStaff = { id: 'staff-2', name: 'Nagy Anna', role: Role.RECEPTIONIST };

/** TICKET-8: a böngészős mock ugyanazzal a jogosultsággal törli a mérést, mint az API. */
describe('mock-engine — mérés törlése (TICKET-8)', () => {
  beforeEach(() => {
    localStorage.clear();
    mockStudioEngine.resetDatabase();
  });

  const measurementIds = () =>
    (mockStudioEngine.getGuestById('guest-1').measurements ?? []).map((m) => m.id);

  it('a rögzítő munkatárs törölheti a saját mérését', () => {
    const created = mockStudioEngine.addMeasurement('guest-1', { weightKg: 70 }, recorder);
    expect(created.recordedById).toBe(recorder.id);

    expect(mockStudioEngine.deleteMeasurement('guest-1', created.id, recorder)).toEqual({
      deletedId: created.id,
    });
    expect(measurementIds()).not.toContain(created.id);
  });

  it('más munkatárs nem törölheti: 403, a mérés megmarad', () => {
    const created = mockStudioEngine.addMeasurement('guest-1', { weightKg: 70 }, recorder);

    expect(
      errorOf(() => mockStudioEngine.deleteMeasurement('guest-1', created.id, otherStaff)),
    ).toMatchObject({ code: 'GUEST.MEASUREMENT_DELETE_FORBIDDEN', status: 403 });
    expect(measurementIds()).toContain(created.id);
  });

  it('adminisztrátor az ismeretlen rögzítőjű mérést is törölheti', () => {
    expect(mockStudioEngine.deleteMeasurement('guest-1', 'ms-1', admin)).toEqual({
      deletedId: 'ms-1',
    });
    expect(measurementIds()).not.toContain('ms-1');
  });

  it('más vendéghez tartozó vagy nem létező mérés: 404', () => {
    expect(
      errorOf(() => mockStudioEngine.deleteMeasurement('guest-2', 'ms-1', admin)),
    ).toMatchObject({ code: 'GUEST.MEASUREMENT_NOT_FOUND', status: 404 });
    expect(
      errorOf(() => mockStudioEngine.deleteMeasurement('guest-1', 'nincs-ilyen', admin)),
    ).toMatchObject({ code: 'GUEST.MEASUREMENT_NOT_FOUND' });
  });
});
