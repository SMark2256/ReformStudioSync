import {
  CheckInResultPayload,
  CheckInRevokedPayload,
  MONITOR_BROADCAST_CHANNEL,
  MonitorAuthRejectedPayload,
  MonitorCheckInPayload,
  MonitorCheckInRevokedPayload,
  MonitorDeviceRevokedPayload,
  MonitorStatePayload,
  MonitorTestPingPayload,
  SCANNER_BROADCAST_CHANNEL,
  ScannerEventPayload,
  SOCKET_EVENTS,
  SOCKET_NAMESPACE,
  toMonitorPayload,
  toMonitorRevokedPayload,
} from '@reform/shared';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/shared/auth';

/** Recepciós ablakok közötti üzenet (SCANNER_BROADCAST_CHANNEL), teljes adattal. */
export type MonitorBroadcastMessage =
  | { type: 'CHECKIN_RESULT'; payload: CheckInResultPayload }
  | { type: 'CHECKIN_REVOKED'; payload: CheckInRevokedPayload }
  | { type: 'SCAN_TRIGGERED'; payload: ScannerEventPayload }
  | { type: 'TEST_PING'; payload: MonitorTestPingPayload }
  | { type: 'DEVICE_REVOKED'; payload: MonitorDeviceRevokedPayload };

/** A Vendégmonitor csatornán (MONITOR_BROADCAST_CHANNEL) csak szűkített adat utazik. */
type LocalMonitorMessage =
  | { type: 'CHECKIN_RESULT'; payload: MonitorCheckInPayload }
  | { type: 'CHECKIN_REVOKED'; payload: MonitorCheckInRevokedPayload }
  | Extract<MonitorBroadcastMessage, { type: 'TEST_PING' | 'DEVICE_REVOKED' }>;

function toLocalMonitorMessage(
  message: MonitorBroadcastMessage,
): LocalMonitorMessage | null {
  switch (message.type) {
    case 'CHECKIN_RESULT':
      return { type: message.type, payload: toMonitorPayload(message.payload) };
    case 'CHECKIN_REVOKED':
      return {
        type: message.type,
        payload: toMonitorRevokedPayload(message.payload),
      };
    case 'SCAN_TRIGGERED':
      // A vonalkód nem kerülhet a monitorra.
      return null;
    default:
      return message;
  }
}

/**
 * Az azonos böngészőben nyitott Vendégmonitor ablakok értesítése. A beléptetési
 * eredményt itt szűkítjük (`toMonitorPayload`), így tartozás, vonalkód,
 * azonosító vagy elutasítási ok nem kerülhet a monitor csatornára.
 */
export function broadcastToLocalMonitors(message: MonitorBroadcastMessage) {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
  const monitorMessage = toLocalMonitorMessage(message);
  if (!monitorMessage) return;
  try {
    const channel = new BroadcastChannel(MONITOR_BROADCAST_CHANNEL);
    channel.postMessage(monitorMessage);
    channel.close();
  } catch {
    // BroadcastChannel not supported
  }
}

export function broadcastToScannerChannel(message: MonitorBroadcastMessage) {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
  try {
    const channel = new BroadcastChannel(SCANNER_BROADCAST_CHANNEL);
    channel.postMessage(message);
    channel.close();
  } catch {
    // BroadcastChannel not supported
  }
}

interface UseMonitorChannelOptions {
  /** Teljes eredmény a munkatársi socket-szobából (csak recepciós felülethez). */
  onCheckInResult?: (payload: CheckInResultPayload) => void;
  /** Teljes sztornó a munkatársi socket-szobából (csak recepciós felülethez). */
  onCheckInRevoked?: (payload: CheckInRevokedPayload) => void;
  /** Szűkített eredmény a Vendégmonitornak (socket + helyi BroadcastChannel). */
  onMonitorCheckIn?: (payload: MonitorCheckInPayload) => void;
  /** Szűkített sztornó a Vendégmonitornak (socket + helyi BroadcastChannel). */
  onMonitorCheckInRevoked?: (payload: MonitorCheckInRevokedPayload) => void;
  onTestPing?: (payload: MonitorTestPingPayload) => void;
  /** Csak a saját (`deviceId`) kijelző visszavonása. */
  onDeviceRevoked?: (payload: MonitorDeviceRevokedPayload) => void;
  /** A szerver elutasította a socket tokenjét; utána bont. */
  onAuthRejected?: (payload: MonitorAuthRejectedPayload) => void;
  enableWakeLock?: boolean;
  enabled?: boolean;
  /**
   * Vendégmonitor-kijelzőként csatlakozik: munkatársi tokennel sem kerül a
   * munkatársi socket-szobába, így teljes beléptetési eredményt nem kap.
   */
  displayOnly?: boolean;
}

/**
 * A szerverkapcsolat valós állapota (TICKET-32):
 * - `idle`: nincs socket (nincs jogosultság, vagy a csatorna ki van kapcsolva)
 * - `connecting`: a socket nyílik, vagy nyitva van, de a szerver még nem léptette a stúdió szobájába
 * - `live`: a szerver beléptette a szobába (megjött a `MONITOR_STATE`)
 * - `offline`: hiba, bontás vagy elutasított token
 */
export type MonitorConnectionStatus = 'idle' | 'connecting' | 'live' | 'offline';

/**
 * Átmeneti szerverhiba (`COMMON.INTERNAL`) miatti elutasítás után a szerveroldali
 * bontásból a socket.io magától nem csatlakozik újra, ezért ennyi idő múlva, legfeljebb
 * ennyiszer próbáljuk újra. A számláló az élő kapcsolattal nullázódik.
 */
const INTERNAL_RETRY_DELAY_MS = 5_000;
const INTERNAL_RETRY_LIMIT = 5;

export function useMonitorChannel(options: UseMonitorChannelOptions = {}) {
  const { accessToken, deviceToken, deviceId } = useAuthStore();
  const isAuthorized = Boolean(accessToken || deviceToken);
  const channelEnabled = (options.enabled ?? true) && isAuthorized;

  const [connectionStatus, setConnectionStatus] =
    useState<MonitorConnectionStatus>('idle');
  const [connectedDisplays, setConnectedDisplays] = useState<number>(0);
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);

  // A hívók renderenként új opció-objektumot (inline callbackeket) adnak át. Ha a
  // kezelők ezektől függnének, a kapcsolat-effektek minden rendernél bontanának és
  // újranyitnának (TICKET-29), ezért a kezelők stabilak, és ebből a ref-ből olvassák
  // a legutóbbi opciókat és azonosítókat.
  const latestRef = useRef({ options, accessToken, deviceId });
  useLayoutEffect(() => {
    latestRef.current = { options, accessToken, deviceId };
  });

  const handleResult = useCallback((payload: CheckInResultPayload) => {
    latestRef.current.options.onCheckInResult?.(payload);
  }, []);

  const handleRevoked = useCallback((payload: CheckInRevokedPayload) => {
    latestRef.current.options.onCheckInRevoked?.(payload);
  }, []);

  const handleMonitorCheckIn = useCallback((payload: MonitorCheckInPayload) => {
    latestRef.current.options.onMonitorCheckIn?.(payload);
  }, []);

  const handleMonitorRevoked = useCallback(
    (payload: MonitorCheckInRevokedPayload) => {
      latestRef.current.options.onMonitorCheckInRevoked?.(payload);
    },
    [],
  );

  const handleTestPing = useCallback((payload: MonitorTestPingPayload) => {
    const { options, deviceId, accessToken } = latestRef.current;
    if (
      payload.deviceId &&
      deviceId &&
      !accessToken &&
      payload.deviceId !== deviceId
    ) {
      return;
    }
    options.onTestPing?.(payload);
  }, []);

  const handleDeviceRevoked = useCallback(
    (payload: MonitorDeviceRevokedPayload) => {
      // A store-ból, nem a ref-ből: a helyi bontás (`clearDeviceAuth`) után még a
      // következő render előtt érkező visszavonás se jusson el a hívóhoz.
      const { deviceId } = useAuthStore.getState();
      if (deviceId && payload.deviceId === deviceId) {
        latestRef.current.options.onDeviceRevoked?.(payload);
      }
    },
    [],
  );

  const handleAuthRejected = useCallback(
    (payload: MonitorAuthRejectedPayload) => {
      latestRef.current.options.onAuthRejected?.(payload);
    },
    [],
  );

  // 1. Azonos PC-n futó másodlagos ablak (<1ms késleltetésű BroadcastChannel)
  useEffect(() => {
    if (!channelEnabled) return;
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    const channel = new BroadcastChannel(MONITOR_BROADCAST_CHANNEL);

    channel.onmessage = (event: MessageEvent<LocalMonitorMessage>) => {
      if (event.data?.type === 'CHECKIN_RESULT') {
        handleMonitorCheckIn(event.data.payload);
      } else if (event.data?.type === 'CHECKIN_REVOKED') {
        handleMonitorRevoked(event.data.payload);
      } else if (event.data?.type === 'TEST_PING') {
        handleTestPing(event.data.payload);
      } else if (event.data?.type === 'DEVICE_REVOKED') {
        handleDeviceRevoked(event.data.payload);
      }
    };

    return () => {
      channel.close();
    };
  }, [
    channelEnabled,
    handleMonitorCheckIn,
    handleMonitorRevoked,
    handleTestPing,
    handleDeviceRevoked,
  ]);

  // 2. Socket.io kapcsolat (Recepciós PC és különálló Tablet/TV szinkronizáció).
  // Csak a jogosultság, a token vagy a kijelzőmód változása nyit új kapcsolatot.
  const token = deviceToken || accessToken;
  const displayOnly = options.displayOnly === true;
  useEffect(() => {
    if (!channelEnabled || !token) {
      setConnectionStatus('idle');
      setConnectedDisplays(0);
      return;
    }

    const wsBaseUrl =
      import.meta.env.VITE_WS_URL ||
      import.meta.env.VITE_API_URL?.replace('/api', '') ||
      'http://localhost:3001';

    const socket: Socket = io(`${wsBaseUrl}${SOCKET_NAMESPACE}`, {
      auth: { token, displayOnly },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });
    setConnectionStatus('connecting');

    let internalRetries = 0;
    let retryTimer: number | undefined;

    const goOffline = () => {
      setConnectionStatus('offline');
      setConnectedDisplays(0);
    };

    // A `connect` csak a socket.io-kapcsolat: élő csak akkor, ha a szerver a
    // hitelesítés után beléptetett a szobába, amit a `MONITOR_STATE` jelez.
    socket.on('connect', () => {
      setConnectionStatus('connecting');
    });
    socket.on('connect_error', goOffline);
    socket.on('disconnect', goOffline);

    socket.on(SOCKET_EVENTS.MONITOR_STATE, (state: MonitorStatePayload) => {
      internalRetries = 0;
      setConnectionStatus('live');
      setConnectedDisplays(state.connectedDisplays);
    });

    socket.on(
      SOCKET_EVENTS.MONITOR_AUTH_REJECTED,
      (payload: MonitorAuthRejectedPayload) => {
        goOffline();
        if (
          payload.code === 'COMMON.INTERNAL' &&
          internalRetries < INTERNAL_RETRY_LIMIT
        ) {
          internalRetries += 1;
          retryTimer = window.setTimeout(() => {
            setConnectionStatus('connecting');
            socket.connect();
          }, INTERNAL_RETRY_DELAY_MS);
        }
        handleAuthRejected(payload);
      },
    );

    // Kijelzőként csak a szűkített, recepcióként csak a teljes eseményekre figyelünk.
    if (displayOnly) {
      socket.on(
        SOCKET_EVENTS.MONITOR_CHECKIN_RESULT,
        (payload: MonitorCheckInPayload) => {
          handleMonitorCheckIn(payload);
        },
      );
      socket.on(
        SOCKET_EVENTS.MONITOR_CHECKIN_REVOKED,
        (payload: MonitorCheckInRevokedPayload) => {
          handleMonitorRevoked(payload);
        },
      );
    } else {
      socket.on(
        SOCKET_EVENTS.CHECKIN_RESULT,
        (payload: CheckInResultPayload) => {
          handleResult(payload);
        },
      );
      socket.on(
        SOCKET_EVENTS.CHECKIN_REVOKED,
        (payload: CheckInRevokedPayload) => {
          handleRevoked(payload);
        },
      );
    }

    socket.on(
      SOCKET_EVENTS.MONITOR_TEST_PING,
      (payload: MonitorTestPingPayload) => {
        handleTestPing(payload);
      },
    );

    socket.on(
      SOCKET_EVENTS.MONITOR_DEVICE_REVOKED,
      (payload: MonitorDeviceRevokedPayload) => {
        handleDeviceRevoked(payload);
      },
    );

    const heartbeatInterval = window.setInterval(() => {
      if (socket.connected) {
        socket.emit(SOCKET_EVENTS.MONITOR_PING);
      }
    }, 30000);

    return () => {
      window.clearInterval(heartbeatInterval);
      window.clearTimeout(retryTimer);
      socket.disconnect();
    };
  }, [
    channelEnabled,
    token,
    displayOnly,
    handleResult,
    handleRevoked,
    handleMonitorCheckIn,
    handleMonitorRevoked,
    handleTestPing,
    handleDeviceRevoked,
    handleAuthRejected,
  ]);

  // 3. Screen Wake Lock API (hogy a Tablet / Monitor ne aludjon el)
  useEffect(() => {
    if (!options.enableWakeLock || !channelEnabled) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let wakeLockSentinel: any = null;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
          setWakeLockActive(true);
          wakeLockSentinel.addEventListener('release', () => {
            setWakeLockActive(false);
          });
        }
      } catch {
        setWakeLockActive(false);
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockSentinel) {
        wakeLockSentinel.release().catch(() => {});
      }
    };
  }, [options.enableWakeLock, channelEnabled]);

  return {
    connectionStatus,
    connectedDisplays,
    wakeLockActive,
    isAuthorized,
  };
}
