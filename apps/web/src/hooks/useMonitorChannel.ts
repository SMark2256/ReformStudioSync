import {
  CheckInResultPayload,
  CheckInRevokedPayload,
  MONITOR_BROADCAST_CHANNEL,
  MonitorStatePayload,
  SCANNER_BROADCAST_CHANNEL,
  ScannerEventPayload,
  SOCKET_EVENTS,
  SOCKET_NAMESPACE,
} from '@reform/shared';
import { useCallback, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';

export type MonitorBroadcastMessage =
  | { type: 'CHECKIN_RESULT'; payload: CheckInResultPayload }
  | { type: 'CHECKIN_REVOKED'; payload: CheckInRevokedPayload }
  | { type: 'SCAN_TRIGGERED'; payload: ScannerEventPayload };

export function broadcastToLocalMonitors(message: MonitorBroadcastMessage) {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
  try {
    const channel = new BroadcastChannel(MONITOR_BROADCAST_CHANNEL);
    channel.postMessage(message);
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
  onCheckInResult?: (payload: CheckInResultPayload) => void;
  onCheckInRevoked?: (payload: CheckInRevokedPayload) => void;
  enableWakeLock?: boolean;
}

export function useMonitorChannel(options: UseMonitorChannelOptions = {}) {
  const { accessToken, deviceToken } = useAuthStore();
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [connectedDisplays, setConnectedDisplays] = useState<number>(1);
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);

  const handleResult = useCallback(
    (payload: CheckInResultPayload) => {
      options.onCheckInResult?.(payload);
    },
    [options],
  );

  const handleRevoked = useCallback(
    (payload: CheckInRevokedPayload) => {
      options.onCheckInRevoked?.(payload);
    },
    [options],
  );

  // 1. Azonos PC-n futó másodlagos ablak (<1ms késleltetésű BroadcastChannel)
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    const channel = new BroadcastChannel(MONITOR_BROADCAST_CHANNEL);

    channel.onmessage = (event: MessageEvent<MonitorBroadcastMessage>) => {
      if (event.data?.type === 'CHECKIN_RESULT') {
        handleResult(event.data.payload);
      } else if (event.data?.type === 'CHECKIN_REVOKED') {
        handleRevoked(event.data.payload);
      }
    };

    return () => {
      channel.close();
    };
  }, [handleResult, handleRevoked]);

  // 2. Socket.io kapcsolat (Recepciós PC és különálló Tablet/TV szinkronizáció)
  useEffect(() => {
    const wsBaseUrl =
      import.meta.env.VITE_WS_URL ||
      import.meta.env.VITE_API_URL?.replace('/api', '') ||
      'http://localhost:3001';

    const token = deviceToken || accessToken;
    const socket: Socket = io(`${wsBaseUrl}${SOCKET_NAMESPACE}`, {
      auth: token ? { token } : {},
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on(SOCKET_EVENTS.MONITOR_STATE, (state: MonitorStatePayload) => {
      setConnectedDisplays(Math.max(1, state.connectedDisplays));
    });

    socket.on(SOCKET_EVENTS.CHECKIN_RESULT, (payload: CheckInResultPayload) => {
      handleResult(payload);
    });

    socket.on(
      SOCKET_EVENTS.CHECKIN_REVOKED,
      (payload: CheckInRevokedPayload) => {
        handleRevoked(payload);
      },
    );

    return () => {
      socket.disconnect();
    };
  }, [accessToken, deviceToken, handleResult, handleRevoked]);

  // 3. Screen Wake Lock API (hogy a Tablet / Monitor ne aludjon el)
  useEffect(() => {
    if (!options.enableWakeLock) return;
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
  }, [options.enableWakeLock]);

  return {
    isConnected,
    connectedDisplays,
    wakeLockActive,
  };
}
