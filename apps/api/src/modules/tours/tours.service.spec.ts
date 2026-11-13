import { applyTourEvent, readTourState } from '@reform/shared';
import { describe, expect, it, vi } from 'vitest';
import { ToursService } from './tours.service';

const empty = { seen: [], closedAt: {} };

function createService(tourState: unknown) {
  const row = { tourState };
  const tx = {
    $queryRaw: vi.fn(async () => [{ tour_state: row.tourState }]),
    user: {
      update: vi.fn(async ({ data }: { data: { tourState: unknown } }) => {
        row.tourState = data.tourState;
        return row;
      }),
    },
  };
  const prisma = {
    user: { findUnique: vi.fn(async () => row) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $transaction: vi.fn(async (cb: any) => cb(tx)),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { service: new ToursService(prisma as any), tx, row };
}

describe('ToursService — látott oldalbemutatók (TICKET-53)', () => {
  it('új fióknál üres a lista', async () => {
    const { service } = createService({});
    await expect(service.getState('u1')).resolves.toEqual({ seen: [] });
  });

  it('a hibás tárolt állapot üresnek számít', () => {
    expect(readTourState(null)).toEqual(empty);
    expect(readTourState(['x'])).toEqual(empty);
    expect(readTourState({ seen: ['a', 3], closedAt: { a: 2, b: 'x' } })).toEqual({
      seen: ['a'],
      closedAt: { a: 2 },
    });
  });

  it('a látott bemutató egyszer kerül a listába, a bezárás lépésével', async () => {
    const { service, tx, row } = createService({});
    await service.recordEvent('u1', { kind: 'seen', id: 'recepcio-pult-v1', step: 2 });
    const result = await service.recordEvent('u1', {
      kind: 'seen',
      id: 'recepcio-pult-v1',
      step: 8,
    });
    expect(result).toEqual({ seen: ['recepcio-pult-v1'] });
    expect(row.tourState).toEqual({
      seen: ['recepcio-pult-v1'],
      closedAt: { 'recepcio-pult-v1': 8 },
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('változatlan állapotnál nem ír', async () => {
    const { service, tx } = createService({ seen: ['*'], closedAt: {} });
    await expect(service.recordEvent('u1', { kind: 'all' })).resolves.toEqual({ seen: ['*'] });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('„Többet ne mutass”: a `*` kerül a listába, ismétlés nélkül', () => {
    const once = applyTourEvent(empty, { kind: 'all' });
    expect(applyTourEvent(once, { kind: 'all' }).seen).toEqual(['*']);
  });

  it('a reset üríti a listát, a lépésstatisztika megmarad', async () => {
    const { service, row } = createService({
      seen: ['recepcio-pult-v1', '*'],
      closedAt: { 'recepcio-pult-v1': 3 },
    });
    await expect(service.recordEvent('u1', { kind: 'reset' })).resolves.toEqual({ seen: [] });
    expect(row.tourState).toEqual({ seen: [], closedAt: { 'recepcio-pult-v1': 3 } });
  });
});
