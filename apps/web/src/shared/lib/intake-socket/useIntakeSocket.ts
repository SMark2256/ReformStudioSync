import {
  IntakeDevicePayload,
  IntakeSocketPayload,
  SOCKET_EVENTS,
  SOCKET_NAMESPACE,
} from '@reform/shared';
import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

type IntakeSocketHandlers = {
  /** Recepció: egy kitöltés állapota változott (csak azonosító és állapot). */
  onUpdated?: (payload: IntakeSocketPayload) => void;
  /** Párosított tablet: kitöltést küldtek erre az eszközre. */
  onAssigned?: (payload: IntakeDevicePayload) => void;
  /** Párosított tablet: a recepció lezárta a vendégmódot. */
  onReleased?: (payload: IntakeDevicePayload) => void;
};

/**
 * Vendégfelvétel valós idejű eseményei (TICKET-56). A szerver a munkatársi tokennel a
 * munkatársi szobába, az eszköztokennel az eszköz saját szobájába léptet; demó módban (API
 * nélkül) nincs kapcsolat, ott a lekérdezések időközönkénti frissítése pótolja.
 */
export function useIntakeSocket(token: string | null, handlers: IntakeSocketHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!token) return;
    const wsBaseUrl =
      import.meta.env.VITE_WS_URL ||
      import.meta.env.VITE_API_URL?.replace('/api', '') ||
      'http://localhost:3001';
    const socket = io(`${wsBaseUrl}${SOCKET_NAMESPACE}`, {
      auth: { token, displayOnly: false },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });
    socket.on(SOCKET_EVENTS.INTAKE_UPDATED, (payload: IntakeSocketPayload) =>
      handlersRef.current.onUpdated?.(payload),
    );
    socket.on(SOCKET_EVENTS.INTAKE_ASSIGNED, (payload: IntakeDevicePayload) =>
      handlersRef.current.onAssigned?.(payload),
    );
    socket.on(SOCKET_EVENTS.INTAKE_RELEASED, (payload: IntakeDevicePayload) =>
      handlersRef.current.onReleased?.(payload),
    );
    return () => {
      socket.disconnect();
    };
  }, [token]);
}
