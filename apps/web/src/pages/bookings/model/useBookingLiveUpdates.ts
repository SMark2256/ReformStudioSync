import { SOCKET_EVENTS, SOCKET_NAMESPACE } from '@reform/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { BOOKING_QUERY_KEYS } from '@/entities/booking';
import { isDemoMode, mockBookingEngine } from '@/shared/api';
import { useAuthStore } from '@/shared/auth';

/**
 * Valós idejű naptár (TICKET-57): a szerver `booking:changed` jelzésére (személyes adat nélkül)
 * a foglalási lekérdezések újratöltődnek. Demóban a mock motor változására.
 */
export function useBookingLiveUpdates(): void {
  const queryClient = useQueryClient();
  const token = useAuthStore((state) => state.accessToken);

  useEffect(() => {
    const refresh = () => void queryClient.invalidateQueries({ queryKey: BOOKING_QUERY_KEYS.all });
    const unsubscribe = mockBookingEngine.subscribe(refresh);
    if (!token || isDemoMode()) return unsubscribe;

    const wsBaseUrl =
      import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001';
    const socket = io(`${wsBaseUrl}${SOCKET_NAMESPACE}`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });
    socket.on(SOCKET_EVENTS.BOOKING_CHANGED, refresh);
    // Újracsatlakozás után a kimaradt változások miatt is frissít.
    socket.io.on('reconnect', refresh);
    return () => {
      unsubscribe();
      socket.disconnect();
    };
  }, [queryClient, token]);
}
