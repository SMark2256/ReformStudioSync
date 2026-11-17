import { useCallback, useState } from 'react';

const SESSION_KEY = 'reform-guest-booking-session';

interface StoredSession {
  token: string;
  expiresAt: string;
}

function readSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const parsed = raw ? (JSON.parse(raw) as StoredSession) : null;
    return parsed && new Date(parsed.expiresAt) > new Date() ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * A vendég munkamenete a nyilvános foglalón (kódos belépés után). Csak a böngészőfülben él
 * (`sessionStorage`), és lejár: közös gépen sem marad bent.
 */
export function useGuestSession() {
  const [session, setSession] = useState<StoredSession | null>(readSession);

  const signIn = useCallback((token: string, expiresAt: string) => {
    const next = { token, expiresAt };
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    } catch {
      // Privát mód: a munkamenet csak a memóriában él.
    }
    setSession(next);
  }, []);

  const signOut = useCallback(() => {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // nincs mit törölni
    }
    setSession(null);
  }, []);

  return { token: session?.token ?? null, signIn, signOut };
}
