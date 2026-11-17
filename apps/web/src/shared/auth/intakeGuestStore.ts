import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * A tablet vendégmódja (TICKET-56): a kitöltéshez kötött, rövid életű vendégtoken. Amíg van,
 * az eszköz csak a vendégmód oldalát mutatja; kilépni csak a munkatárs kódjával lehet.
 */
interface IntakeGuestState {
  sessionId: string | null;
  guestToken: string | null;
  expiresAt: string | null;
  start: (session: { sessionId: string; guestToken: string; expiresAt: string }) => void;
  clear: () => void;
}

export const useIntakeGuestStore = create<IntakeGuestState>()(
  persist(
    (set) => ({
      sessionId: null,
      guestToken: null,
      expiresAt: null,
      start: ({ sessionId, guestToken, expiresAt }) => set({ sessionId, guestToken, expiresAt }),
      clear: () => set({ sessionId: null, guestToken: null, expiresAt: null }),
    }),
    { name: 'reform-studio-intake-guest' },
  ),
);
