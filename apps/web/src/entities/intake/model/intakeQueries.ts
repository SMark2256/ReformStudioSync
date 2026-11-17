import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api';

// Vendégfelvétel (TICKET-56): a recepció listája és részletnézete ugyanazt a gyorsítótárat
// használja; a socket (`intake:updated`) és a mutációk ezeket a kulcsokat frissítik.
export const INTAKE_QUERY_KEYS = {
  all: ['intake'] as const,
  sessions: ['intake', 'sessions'] as const,
  session: (id: string) => ['intake', 'session', id] as const,
  health: (id: string) => ['intake', 'health', id] as const,
  packages: ['intake', 'packages'] as const,
  guestDocuments: (guestId: string) => ['intake', 'guest-documents', guestId] as const,
};

// A demó (mock) módban nincs socket: a lista rövid időközönként frissül.
const REFETCH_INTERVAL_MS = 5000;

export const useIntakeSessions = () =>
  useQuery({
    queryKey: INTAKE_QUERY_KEYS.sessions,
    queryFn: () => api.getIntakeSessions(),
    refetchInterval: REFETCH_INTERVAL_MS,
  });

export const useIntakeSession = (id: string | null) =>
  useQuery({
    queryKey: INTAKE_QUERY_KEYS.session(id ?? ''),
    queryFn: () => api.getIntakeSession(id!),
    enabled: Boolean(id),
    refetchInterval: REFETCH_INTERVAL_MS,
  });

export const useIntakePackages = () =>
  useQuery({
    queryKey: INTAKE_QUERY_KEYS.packages,
    queryFn: () => api.getIntakePackages(),
    staleTime: 5 * 60 * 1000,
  });

export const useGuestIntakeDocuments = (guestId: string | null | undefined) =>
  useQuery({
    queryKey: INTAKE_QUERY_KEYS.guestDocuments(guestId ?? ''),
    queryFn: () => api.getGuestIntakeDocuments(guestId!),
    enabled: Boolean(guestId),
  });
