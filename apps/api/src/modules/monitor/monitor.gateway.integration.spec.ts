import {
  APP_ERROR_CATALOG,
  appError,
  MonitorAuthRejectedPayload,
  MonitorDeviceRevokedPayload,
  SOCKET_EVENTS,
  SOCKET_NAMESPACE,
} from '@reform/shared';
import { createServer } from 'http';
import { AddressInfo } from 'net';
import { Namespace, Server, Socket } from 'socket.io';
import { io, Socket as ClientSocket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MonitorGateway } from './monitor.gateway';

const STUDIO_ID = 'studio-1';
const MONITOR_ROOM = `studio:${STUDIO_ID}`;
const DEVICE_AUTH = {
  studioId: STUDIO_ID,
  type: 'DEVICE' as const,
  name: 'Kijelző',
  deviceId: 'device-1',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/**
 * Valódi socket.io szerver és kliens a Nest WebSocket adapter nélkül: a namespace
 * eseményeit ugyanúgy kötjük a gatewayre, ahogy az adapter (`connection` →
 * `handleConnection`, a socket `disconnect` eseménye → `handleDisconnect`).
 */
describe('MonitorGateway — valódi socket.io kapcsolat (TICKET-30)', () => {
  let ioServer: Server;
  let nsp: Namespace;
  let gateway: MonitorGateway;
  let baseUrl: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let authServiceMock: any;
  /** Szerveroldali socketenként: a `handleConnection` és a bontás befejeződése. */
  let serverSides: { connected: Promise<void>; disconnected: Promise<void> }[];
  const clients: ClientSocket[] = [];

  beforeEach(async () => {
    serverSides = [];
    authServiceMock = {
      validateSocketToken: vi.fn(),
      recordDeviceActivity: vi.fn().mockResolvedValue(undefined),
    };
    gateway = new MonitorGateway(authServiceMock);

    const httpServer = createServer();
    ioServer = new Server(httpServer);
    nsp = ioServer.of(SOCKET_NAMESPACE);
    // Namespace-es gatewaynél a Nest is a namespace-t adja `server`-ként.
    gateway.server = nsp;
    nsp.on('connection', (socket: Socket) => {
      const disconnected = new Promise<void>((resolve) => {
        socket.on('disconnect', () => {
          gateway.handleDisconnect(socket);
          resolve();
        });
      });
      serverSides.push({
        connected: gateway.handleConnection(socket),
        disconnected,
      });
    });

    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const { port } = httpServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}${SOCKET_NAMESPACE}`;
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) client.disconnect();
    await new Promise<void>((resolve) => ioServer.close(() => resolve()));
  });

  function createClient(token = 'device-token') {
    const client = io(baseUrl, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    clients.push(client);
    return client;
  }

  /** Csatlakozik, és megvárja, hogy a szerver is lássa a kapcsolatot. */
  async function connectClient() {
    const client = createClient();
    await new Promise<void>((resolve, reject) => {
      client.once('connect', () => resolve());
      client.once('connect_error', reject);
    });
    return { client, server: serverSides[serverSides.length - 1] };
  }

  const displays = () => gateway.getMonitorState(STUDIO_ID).connectedDisplays;

  it('a hitelesítés közben bontó kliens után a szerveroldali állapot üres', async () => {
    const auth = deferred<typeof DEVICE_AUTH>();
    authServiceMock.validateSocketToken.mockReturnValue(auth.promise);

    const { client, server } = await connectClient();
    client.disconnect();
    await server.disconnected;
    auth.resolve(DEVICE_AUTH);
    await server.connected;

    expect(displays()).toBe(0);
    expect(gateway.isDeviceOnline('device-1')).toBe(false);
    expect(gateway.getOnlineDeviceIds().size).toBe(0);
    expect(nsp.adapter.rooms.has(MONITOR_ROOM)).toBe(false);
    expect(nsp.sockets.size).toBe(0);
  });

  it('két egymás utáni csatlakozás és bontás után a kijelzőszám 0', async () => {
    authServiceMock.validateSocketToken.mockResolvedValue(DEVICE_AUTH);

    for (let round = 0; round < 2; round++) {
      const { client, server } = await connectClient();
      await server.connected;
      expect(displays()).toBe(1);
      expect(nsp.adapter.rooms.get(MONITOR_ROOM)?.size).toBe(1);

      client.disconnect();
      await server.disconnected;
      expect(displays()).toBe(0);
    }

    expect(gateway.isDeviceOnline('device-1')).toBe(false);
    expect(nsp.adapter.rooms.has(MONITOR_ROOM)).toBe(false);
  });

  /** Az esemény és a bontás sorrendjét is rögzíti a kliensoldalon. */
  function watchUntilDisconnect<T>(client: ClientSocket, event: string) {
    const order: string[] = [];
    const received = new Promise<T>((resolve) => {
      client.once(event, (payload: T) => {
        order.push(event);
        resolve(payload);
      });
    });
    const disconnectReason = new Promise<string>((resolve) => {
      client.once('disconnect', (reason: string) => {
        order.push('disconnect');
        resolve(reason);
      });
    });
    return { order, received, disconnectReason };
  }

  it('visszavonáskor a kijelző megkapja az okot, majd a szerver bontja (TICKET-31)', async () => {
    authServiceMock.validateSocketToken.mockResolvedValue(DEVICE_AUTH);
    const { client, server } = await connectClient();
    await server.connected;
    expect(gateway.isDeviceOnline('device-1')).toBe(true);
    const watched = watchUntilDisconnect<MonitorDeviceRevokedPayload>(
      client,
      SOCKET_EVENTS.MONITOR_DEVICE_REVOKED,
    );
    const revoked: MonitorDeviceRevokedPayload = {
      deviceId: 'device-1',
      reason: 'A kijelző párosítása törlésre került a recepcióról.',
      timestamp: '2026-11-11T10:00:00.000Z',
    };

    gateway.disconnectDevice(revoked);
    expect(gateway.isDeviceOnline('device-1')).toBe(false);
    expect(displays()).toBe(0);

    await expect(watched.received).resolves.toEqual(revoked);
    await expect(watched.disconnectReason).resolves.toBe('io server disconnect');
    expect(watched.order).toEqual([
      SOCKET_EVENTS.MONITOR_DEVICE_REVOKED,
      'disconnect',
    ]);
    await server.disconnected;
    expect(nsp.sockets.size).toBe(0);
    expect(nsp.adapter.rooms.has(MONITOR_ROOM)).toBe(false);
  });

  it('érvénytelen tokennél a kliens a bontás előtt megkapja az okot (TICKET-31)', async () => {
    authServiceMock.validateSocketToken.mockRejectedValue(
      appError('AUTH.DEVICE_TOKEN_INVALID'),
    );
    const client = createClient('stale-token');
    const watched = watchUntilDisconnect<MonitorAuthRejectedPayload>(
      client,
      SOCKET_EVENTS.MONITOR_AUTH_REJECTED,
    );

    await expect(watched.received).resolves.toEqual({
      code: 'AUTH.DEVICE_TOKEN_INVALID',
      message: APP_ERROR_CATALOG['AUTH.DEVICE_TOKEN_INVALID'].message,
      timestamp: expect.any(String),
    });
    await expect(watched.disconnectReason).resolves.toBe('io server disconnect');
    expect(watched.order).toEqual([
      SOCKET_EVENTS.MONITOR_AUTH_REJECTED,
      'disconnect',
    ]);
    await serverSides[serverSides.length - 1].disconnected;
    expect(displays()).toBe(0);
    expect(nsp.sockets.size).toBe(0);
  });
});
