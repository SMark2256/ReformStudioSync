import {
  CheckInResultPayload,
  MonitorAuthRejectedPayload,
  MonitorCheckInPayload,
  SOCKET_EVENTS,
} from '@reform/shared';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/shared/auth';
import { useMonitorChannel } from './useMonitorChannel';

const { io, sockets } = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void;

  /**
   * A socket.io-client `Socket` minimális mása. A `disconnect()` az igazihoz
   * hasonlóan szinkron kiváltja a `disconnect` eseményt.
   */
  class FakeSocket {
    connected = false;
    private listeners = new Map<string, Listener[]>();

    on(event: string, listener: Listener) {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
      return this;
    }

    emit = vi.fn();

    /** Kézi újracsatlakozás (szerveroldali bontás után a socket.io magától nem próbálkozik). */
    connect = vi.fn(() => this);

    disconnect = vi.fn(() => {
      this.connected = false;
      this.fire('disconnect', 'io client disconnect');
      return this;
    });

    /** A szerver felől érkező esemény. */
    fire(event: string, ...args: unknown[]) {
      if (event === 'connect') this.connected = true;
      for (const listener of this.listeners.get(event) ?? []) listener(...args);
    }
  }

  const sockets: FakeSocket[] = [];
  const io = vi.fn(() => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  });
  return { io, sockets };
});

vi.mock('socket.io-client', () => ({ io }));

/** BroadcastChannel csere: a létrehozott csatornák számolhatók, az üzenet kézzel kiváltható. */
class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  close = vi.fn();

  constructor(public readonly name: string) {
    FakeBroadcastChannel.instances.push(this);
  }

  postMessage() {}
}

type HookOptions = NonNullable<Parameters<typeof useMonitorChannel>[0]>;

function renderChannel(initialProps: HookOptions) {
  return renderHook((props: HookOptions) => useMonitorChannel(props), {
    initialProps,
  });
}

const fire = (event: string, ...args: unknown[]) =>
  act(() => {
    sockets[sockets.length - 1].fire(event, ...args);
  });

const checkInResult = { guestName: 'Kovács Anna' } as unknown as CheckInResultPayload;
const monitorCheckIn = { firstName: 'Anna' } as unknown as MonitorCheckInPayload;

beforeEach(() => {
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  useAuthStore.setState({
    accessToken: 'staff-token',
    deviceToken: null,
    deviceId: null,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  io.mockClear();
  sockets.length = 0;
  FakeBroadcastChannel.instances = [];
});

describe('useMonitorChannel: TICKET-29', () => {
  it('új inline opciókkal újrarenderelve sem nyit új socketet', () => {
    const { rerender } = renderChannel({ onCheckInResult: () => {} });
    for (let i = 0; i < 5; i += 1) {
      rerender({ onCheckInResult: () => {} });
    }

    expect(io).toHaveBeenCalledTimes(1);
    expect(sockets[0].disconnect).not.toHaveBeenCalled();
  });

  it('a connect és a szerveroldali disconnect esemény után sem nyit új socketet', () => {
    const { result } = renderChannel({ onCheckInResult: () => {} });

    fire('connect');
    fire(SOCKET_EVENTS.MONITOR_STATE, { studioId: 'default-studio', connectedDisplays: 1 });
    expect(result.current.connectionStatus).toBe('live');

    fire('disconnect', 'transport close');
    expect(result.current.connectionStatus).toBe('offline');

    expect(io).toHaveBeenCalledTimes(1);
  });

  it('MONITOR_STATE után frissül a kijelzőszám, új socket nélkül', () => {
    const { result } = renderChannel({});
    fire('connect');

    fire(SOCKET_EVENTS.MONITOR_STATE, { studioId: 'default-studio', connectedDisplays: 3 });

    expect(result.current.connectedDisplays).toBe(3);
    expect(io).toHaveBeenCalledTimes(1);
  });

  it('az eseményt a legutóbb átadott callback kapja', () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = renderChannel({ onCheckInResult: first });
    rerender({ onCheckInResult: latest });

    fire(SOCKET_EVENTS.CHECKIN_RESULT, checkInResult);

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith(checkInResult);
  });

  it('kijelzőként a szűkített eseményt a legutóbbi callback kapja', () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = renderChannel({ displayOnly: true, onMonitorCheckIn: first });
    rerender({ displayOnly: true, onMonitorCheckIn: latest });

    fire(SOCKET_EVENTS.MONITOR_CHECKIN_RESULT, monitorCheckIn);

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith(monitorCheckIn);
    expect(io).toHaveBeenCalledTimes(1);
  });

  it('tokenváltáskor bontja a régi és egy új socketet nyit', () => {
    renderChannel({});
    fire('connect');

    act(() => {
      useAuthStore.setState({ accessToken: 'new-staff-token' });
    });

    expect(io).toHaveBeenCalledTimes(2);
    expect(sockets[0].disconnect).toHaveBeenCalledTimes(1);
    expect(sockets[1].disconnect).not.toHaveBeenCalled();
    expect(io).toHaveBeenLastCalledWith(
      expect.stringContaining('/monitor'),
      expect.objectContaining({ auth: { token: 'new-staff-token', displayOnly: false } }),
    );
  });

  it('a helyi BroadcastChannel sem nyílik újra rendernként, és a legutóbbi callbacket hívja', () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = renderChannel({ displayOnly: true, onMonitorCheckIn: first });
    rerender({ displayOnly: true, onMonitorCheckIn: latest });

    expect(FakeBroadcastChannel.instances).toHaveLength(1);
    const [channel] = FakeBroadcastChannel.instances;
    act(() => {
      channel.onmessage?.(
        new MessageEvent('message', {
          data: { type: 'CHECKIN_RESULT', payload: monitorCheckIn },
        }),
      );
    });

    expect(channel.close).not.toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith(monitorCheckIn);
  });
});

const rejection = (code: string): MonitorAuthRejectedPayload => ({
  code,
  message: 'Elutasítva.',
  timestamp: '2026-11-11T10:00:00.000Z',
});

/** A gateway elutasítása: az ok, majd szerveroldali bontás. */
const reject = (code: string) => {
  fire(SOCKET_EVENTS.MONITOR_AUTH_REJECTED, rejection(code));
  fire('disconnect', 'io server disconnect');
};

const revoked = (deviceId: string) => ({
  deviceId,
  timestamp: '2026-11-11T10:00:00.000Z',
});

describe('useMonitorChannel: valós kapcsolatállapot (TICKET-32)', () => {
  it('csak a MONITOR_STATE után élő, a socket connect eseménye még nem', () => {
    const { result } = renderChannel({ displayOnly: true });
    expect(result.current.connectionStatus).toBe('connecting');

    fire('connect');
    expect(result.current.connectionStatus).toBe('connecting');

    fire(SOCKET_EVENTS.MONITOR_STATE, { studioId: 'default-studio', connectedDisplays: 2 });
    expect(result.current.connectionStatus).toBe('live');
    expect(result.current.connectedDisplays).toBe(2);
  });

  it('bontáskor nem élő, és a kijelzőszám sem marad a régi', () => {
    const { result } = renderChannel({});
    fire('connect');
    fire(SOCKET_EVENTS.MONITOR_STATE, { studioId: 'default-studio', connectedDisplays: 2 });

    fire('disconnect', 'transport close');

    expect(result.current.connectionStatus).toBe('offline');
    expect(result.current.connectedDisplays).toBe(0);
  });

  it('elérhetetlen szervernél (connect_error) nem élő', () => {
    const { result } = renderChannel({ displayOnly: true });

    fire('connect_error', new Error('xhr poll error'));

    expect(result.current.connectionStatus).toBe('offline');
  });

  it('jogosultság nélkül nincs socket, az állapot idle', () => {
    useAuthStore.setState({ accessToken: null, deviceToken: null, deviceId: null });
    const { result } = renderChannel({ displayOnly: true });

    expect(io).not.toHaveBeenCalled();
    expect(result.current.connectionStatus).toBe('idle');
  });

  it('MONITOR_AUTH_REJECTED a legutóbbi onAuthRejected-et hívja a payloaddal, és nem élő', () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { result, rerender } = renderChannel({ displayOnly: true, onAuthRejected: first });
    rerender({ displayOnly: true, onAuthRejected: latest });
    fire('connect');
    fire(SOCKET_EVENTS.MONITOR_STATE, { studioId: 'default-studio', connectedDisplays: 1 });

    fire(SOCKET_EVENTS.MONITOR_AUTH_REJECTED, rejection('AUTH.DEVICE_TOKEN_INVALID'));

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith(rejection('AUTH.DEVICE_TOKEN_INVALID'));
    expect(result.current.connectionStatus).toBe('offline');
  });

  it('átmeneti szerverhibánál (COMMON.INTERNAL) késleltetve újracsatlakozik', () => {
    vi.useFakeTimers();
    const { result } = renderChannel({ displayOnly: true });
    fire('connect');

    reject('COMMON.INTERNAL');
    expect(result.current.connectionStatus).toBe('offline');

    act(() => {
      vi.advanceTimersByTime(4_999);
    });
    expect(sockets[0].connect).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(sockets[0].connect).toHaveBeenCalledTimes(1);
    expect(result.current.connectionStatus).toBe('connecting');
    // Ugyanaz a socket próbálkozik újra, új kapcsolat nem nyílik.
    expect(io).toHaveBeenCalledTimes(1);
  });

  it('a COMMON.INTERNAL újrapróbálás korlátozott, élő kapcsolat után újraindul', () => {
    vi.useFakeTimers();
    renderChannel({ displayOnly: true });
    const attempt = () => {
      fire('connect');
      reject('COMMON.INTERNAL');
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
    };

    for (let i = 0; i < 7; i += 1) attempt();
    expect(sockets[0].connect).toHaveBeenCalledTimes(5);

    fire('connect');
    fire(SOCKET_EVENTS.MONITOR_STATE, { studioId: 'default-studio', connectedDisplays: 1 });
    attempt();
    expect(sockets[0].connect).toHaveBeenCalledTimes(6);
  });

  it.each(['AUTH.DEVICE_TOKEN_INVALID', 'AUTH.UNAUTHENTICATED'])(
    '%s elutasítás után nem csatlakozik újra',
    (code) => {
      vi.useFakeTimers();
      const { result } = renderChannel({ displayOnly: true });
      fire('connect');

      reject(code);
      act(() => {
        vi.advanceTimersByTime(60_000);
      });

      expect(sockets[0].connect).not.toHaveBeenCalled();
      expect(io).toHaveBeenCalledTimes(1);
      expect(result.current.connectionStatus).toBe('offline');
    },
  );

  it('lebontáskor a függő újrapróbálás elmarad', () => {
    vi.useFakeTimers();
    const { unmount } = renderChannel({ displayOnly: true });
    fire('connect');
    reject('COMMON.INTERNAL');

    unmount();
    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(sockets[0].connect).not.toHaveBeenCalled();
  });

  it('MONITOR_DEVICE_REVOKED csak a saját deviceId-re hívja az onDeviceRevoked-et', () => {
    useAuthStore.setState({ accessToken: null, deviceToken: 'device-token', deviceId: 'device-1' });
    const onDeviceRevoked = vi.fn();
    renderChannel({ displayOnly: true, onDeviceRevoked });
    fire('connect');

    fire(SOCKET_EVENTS.MONITOR_DEVICE_REVOKED, revoked('device-2'));
    expect(onDeviceRevoked).not.toHaveBeenCalled();

    fire(SOCKET_EVENTS.MONITOR_DEVICE_REVOKED, revoked('device-1'));
    expect(onDeviceRevoked).toHaveBeenCalledTimes(1);
    expect(onDeviceRevoked).toHaveBeenCalledWith(revoked('device-1'));
  });

  it('a helyi párosítás-törlés után érkező visszavonás már nem jut el a hívóhoz', () => {
    useAuthStore.setState({ accessToken: null, deviceToken: 'device-token', deviceId: 'device-1' });
    const onDeviceRevoked = vi.fn();
    renderChannel({ displayOnly: true, onDeviceRevoked });
    const [socket] = sockets;
    fire('connect');

    act(() => {
      useAuthStore.getState().clearDeviceAuth();
    });
    // A régi socket kezelője még a bontás előtt kapja meg az üzenetet.
    socket.fire(SOCKET_EVENTS.MONITOR_DEVICE_REVOKED, revoked('device-1'));

    expect(onDeviceRevoked).not.toHaveBeenCalled();
  });
});
