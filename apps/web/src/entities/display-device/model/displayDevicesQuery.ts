import { DisplayDeviceDto } from '@reform/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api';

// A kijelzőlista lekérdezési kulcsa: a Monitorok oldal, a fiókpanel számlálója és a recepció
// frissítése ugyanazt a gyorsítótárat használja.
export const DISPLAY_DEVICES_QUERY_KEY = ['display-devices'] as const;

const REFETCH_INTERVAL_MS = 4000;

/** Párosított kijelzők; `enabled: false` mellett nem kérdez le és nem frissül. */
export const useDisplayDevices = ({ enabled = true } = {}) =>
  useQuery({
    queryKey: DISPLAY_DEVICES_QUERY_KEY,
    queryFn: () => api.getDisplayDevices(),
    enabled,
    refetchInterval: enabled ? REFETCH_INTERVAL_MS : false,
  });

/** Jelenleg aktív kijelzők: párosított, és a szerverhez éppen kapcsolódik. */
export const countActiveDisplayDevices = (
  devices: DisplayDeviceDto[],
): number =>
  devices.filter((device) => device.status === 'PAIRED' && device.isOnline)
    .length;
