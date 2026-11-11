import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_ACCENT, isAccentHex } from './accent';

// A kiemelő szín felhasználónként mentődik (első körben localStorage). A beállító felület a
// Beállítások oldalon lesz (TICKET-24); az alkalmazás az `app` rétegben alkalmazza.
interface AccentState {
  accent: string;
  setAccent: (hex: string) => void;
}

export const useAccentStore = create<AccentState>()(
  persist(
    (set) => ({
      accent: DEFAULT_ACCENT,
      setAccent: (hex) => {
        if (isAccentHex(hex)) set({ accent: hex.toLowerCase() });
      },
    }),
    {
      name: 'reform_studio_accent',
    },
  ),
);
