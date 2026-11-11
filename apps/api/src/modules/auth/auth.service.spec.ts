import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';

const STUDIO_ID = 'studio-1';

function deviceRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'device-1',
    studioId: STUDIO_ID,
    name: 'Bejárati kijelző',
    deviceToken: 'old-token',
    pairingCode: null,
    pairingExpiresAt: null,
    pairedAt: new Date('2026-11-10T08:00:00.000Z'),
    isActive: true,
    lastSeenAt: new Date('2026-11-11T08:00:00.000Z'),
    lastActivityType: 'Élő kapcsolat (Heartbeat)',
    createdAt: new Date('2026-11-01T08:00:00.000Z'),
    ...overrides,
  };
}

describe('AuthService — párosítás visszavonása bontja a kijelzőt (TICKET-31)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prismaMock: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let monitorGatewayMock: any;
  let service: AuthService;

  beforeEach(() => {
    prismaMock = {
      displayDevice: {
        findFirst: vi.fn().mockResolvedValue(deviceRecord()),
        findUnique: vi.fn().mockResolvedValue(deviceRecord()),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        update: vi.fn().mockImplementation(async ({ data }: { data: any }) =>
          deviceRecord(data),
        ),
        delete: vi.fn().mockResolvedValue(deviceRecord()),
      },
    };
    monitorGatewayMock = {
      disconnectDevice: vi.fn(),
      isDeviceOnline: vi.fn().mockReturnValue(false),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AuthService(prismaMock, {} as any, monitorGatewayMock);
  });

  /** A bontás csak a DB-módosítás után jöhet: addig a régi token még érvényes. */
  const expectDisconnectedAfter = (dbCall: ReturnType<typeof vi.fn>) => {
    expect(monitorGatewayMock.disconnectDevice).toHaveBeenCalledTimes(1);
    expect(monitorGatewayMock.disconnectDevice).toHaveBeenCalledWith({
      deviceId: 'device-1',
      reason: expect.any(String),
      timestamp: expect.any(String),
    });
    expect(dbCall.mock.invocationCallOrder[0]).toBeLessThan(
      monitorGatewayMock.disconnectDevice.mock.invocationCallOrder[0],
    );
  };

  it('új párosító kód kérésekor a token cserélődik, és a kijelző bontódik', async () => {
    const result = await service.regenerateDisplayPairingCode('device-1', STUDIO_ID);

    expect(prismaMock.displayDevice.findFirst).toHaveBeenCalledWith({
      where: { id: 'device-1', studioId: STUDIO_ID },
    });
    const { data } = prismaMock.displayDevice.update.mock.calls[0][0];
    expect(data.deviceToken).not.toBe('old-token');
    expectDisconnectedAfter(prismaMock.displayDevice.update);
    expect(result.status).toBe('PENDING_PAIRING');
    expect(result.isOnline).toBe(false);
  });

  it('törléskor a kijelző bontódik', async () => {
    await expect(
      service.deleteDisplayDevice('device-1', STUDIO_ID),
    ).resolves.toEqual({ deletedId: 'device-1' });

    expect(prismaMock.displayDevice.findFirst).toHaveBeenCalledWith({
      where: { id: 'device-1', studioId: STUDIO_ID },
    });
    expectDisconnectedAfter(prismaMock.displayDevice.delete);
  });

  it('az eszközről kért párosítás-bontáskor a kijelző bontódik', async () => {
    await expect(
      service.unpairSelfDevice({ deviceToken: ' old-token ' }),
    ).resolves.toEqual({ unpairedId: 'device-1' });

    expect(prismaMock.displayDevice.findUnique).toHaveBeenCalledWith({
      where: { deviceToken: 'old-token' },
    });
    expectDisconnectedAfter(prismaMock.displayDevice.delete);
  });

  it.each([
    ['új kód', (s: AuthService) => s.regenerateDisplayPairingCode('device-1', 'other-studio')],
    ['törlés', (s: AuthService) => s.deleteDisplayDevice('device-1', 'other-studio')],
  ])(
    'más stúdió kijelzőjénél (%s) nincs bontás',
    async (_label, action) => {
      prismaMock.displayDevice.findFirst.mockResolvedValue(null);

      await expect(action(service)).rejects.toMatchObject({
        code: 'AUTH.DEVICE_NOT_FOUND',
      });
      expect(monitorGatewayMock.disconnectDevice).not.toHaveBeenCalled();
    },
  );

  it('ismeretlen tokenű eszközről kért bontás nem bont kijelzőt', async () => {
    prismaMock.displayDevice.findUnique.mockResolvedValue(null);

    await expect(
      service.unpairSelfDevice({ deviceToken: 'unknown' }),
    ).resolves.toEqual({ unpairedId: 'unknown' });
    expect(monitorGatewayMock.disconnectDevice).not.toHaveBeenCalled();
  });
});

describe('AuthService.validateSocketToken — közben törölt kijelző (TICKET-32)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prismaMock: any;
  let service: AuthService;

  beforeEach(() => {
    prismaMock = {
      displayDevice: {
        findUnique: vi.fn().mockResolvedValue(deviceRecord()),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    // Nem munkatársi JWT: a kijelző-ágon próbálkozik.
    const jwtServiceMock = {
      verifyAsync: vi.fn().mockRejectedValue(new Error('jwt malformed')),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AuthService(prismaMock, jwtServiceMock as any, {} as any);
  });

  it('érvényes eszköztokennél frissíti az utolsó aktivitást, és az eszközt adja', async () => {
    await expect(service.validateSocketToken('old-token')).resolves.toEqual({
      studioId: STUDIO_ID,
      type: 'DEVICE',
      name: 'Bejárati kijelző',
      deviceId: 'device-1',
    });
    expect(prismaMock.displayDevice.updateMany).toHaveBeenCalledWith({
      where: { id: 'device-1', deviceToken: 'old-token' },
      data: expect.objectContaining({ lastSeenAt: expect.any(Date) }),
    });
  });

  it('ha az eszközt a lekérdezés és a frissítés között törlik, DEVICE_TOKEN_INVALID (nem INTERNAL)', async () => {
    prismaMock.displayDevice.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.validateSocketToken('old-token')).rejects.toMatchObject({
      code: 'AUTH.DEVICE_TOKEN_INVALID',
    });
  });

  it('ismeretlen tokennél DEVICE_TOKEN_INVALID, frissítés nélkül', async () => {
    prismaMock.displayDevice.findUnique.mockResolvedValue(null);

    await expect(service.validateSocketToken('unknown')).rejects.toMatchObject({
      code: 'AUTH.DEVICE_TOKEN_INVALID',
    });
    expect(prismaMock.displayDevice.updateMany).not.toHaveBeenCalled();
  });
});
