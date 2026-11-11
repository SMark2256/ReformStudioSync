import {
  CheckInResultPayload,
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
    expect(result.current.isConnected).toBe(true);

    fire('disconnect', 'transport close');
    expect(result.current.isConnected).toBe(false);

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
