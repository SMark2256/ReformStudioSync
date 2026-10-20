import {
  CheckInResultPayload,
  CheckInRevokedPayload,
  MONITOR_BROADCAST_CHANNEL,
  MonitorDeviceRevokedPayload,
  MonitorStatePayload,
  MonitorTestPingPayload,
  SOCKET_EVENTS,
  SOCKET_NAMESPACE,
} from '@reform/shared';
import { useCallback, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';

export type MonitorBroadcastMessage =
  | { type: 'CHECKIN_RESULT'; payload: CheckInResultPayload }
  | { type: 'CHECKIN_REVOKED'; payload: CheckInRevokedPayload }
  | { type: 'TEST_PING'; payload: MonitorTestPingPayload }
  | { type: 'DEVICE_REVOKED'; payload: MonitorDeviceRevokedPayload };

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

interface UseMonitorChannelOptions {
  onCheckInResult?: (payload: CheckInResultPayload) => void;
  onCheckInRevoked?: (payload: CheckInRevokedPayload) => void;
  onTestPing?: (payload: MonitorTestPingPayload) => void;
  onDeviceRevoked?: (payload: MonitorDeviceRevokedPayload) => void;
  enableWakeLock?: boolean;
  enabled?: boolean;
}

export function useMonitorChannel(options: UseMonitorChannelOptions = {}) {
  const { accessToken, deviceToken, deviceId } = useAuthStore();
  const isAuthorized = Boolean(accessToken || deviceToken);
  const channelEnabled = (options.enabled ?? true) && isAuthorized;

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

  const handleTestPing = useCallback(
    (payload: MonitorTestPingPayload) => {
      if (
        payload.deviceId &&
        deviceId &&
        !accessToken &&
        payload.deviceId !== deviceId
      ) {
        return;
      }
      options.onTestPing?.(payload);
    },
    [options, deviceId, accessToken],
  );

  const handleDeviceRevoked = useCallback(
    (payload: MonitorDeviceRevokedPayload) => {
      if (deviceId && payload.deviceId === deviceId) {
        options.onDeviceRevoked?.(payload);
      }
    },
    [options, deviceId],
  );

  // 1. Azonos PC-n futó másodlagos ablak (<1ms késleltetésű BroadcastChannel)
  useEffect(() => {
    if (!channelEnabled) return;
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    const channel = new BroadcastChannel(MONITOR_BROADCAST_CHANNEL);

    channel.onmessage = (event: MessageEvent<MonitorBroadcastMessage>) => {
      if (event.data?.type === 'CHECKIN_RESULT') {
        handleResult(event.data.payload);
      } else if (event.data?.type === 'CHECKIN_REVOKED') {
        handleRevoked(event.data.payload);
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
    handleResult,
    handleRevoked,
    handleTestPing,
    handleDeviceRevoked,
  ]);

  // 2. Socket.io kapcsolat (Recepciós PC és különálló Tablet/TV szinkronizáció)
  useEffect(() => {
    const token = deviceToken || accessToken;
    if (!channelEnabled || !token) {
      setIsConnected(false);
      return;
    }

    const wsBaseUrl =
      import.meta.env.VITE_WS_URL ||
      import.meta.env.VITE_API_URL?.replace('/api', '') ||
      'http://localhost:3001';

    const socket: Socket = io(`${wsBaseUrl}${SOCKET_NAMESPACE}`, {
      auth: { token },
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
      socket.disconnect();
    };
  }, [
    channelEnabled,
    accessToken,
    deviceToken,
    handleResult,
    handleRevoked,
    handleTestPing,
    handleDeviceRevoked,
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
    isConnected,
    connectedDisplays,
    wakeLockActive,
    isAuthorized,
  };
}
