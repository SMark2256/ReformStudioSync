import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ReceptionTheme = 'light' | 'dark';

interface ThemeState {
  theme: ReceptionTheme;
  toggleTheme: () => ReceptionTheme;
  setTheme: (theme: ReceptionTheme) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      toggleTheme: () => {
        const next: ReceptionTheme = get().theme === 'light' ? 'dark' : 'light';
        set({ theme: next });
        return next;
      },
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'reform_studio_reception_theme',
    },
  ),
);
