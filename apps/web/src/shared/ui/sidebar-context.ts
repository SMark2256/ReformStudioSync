import * as React from 'react';
import { appError } from '@reform/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Az oldalsáv nyitott/összecsukott állapota felhasználónként mentődik (`null`: még nem
// választott, ilyenkor a `SidebarProvider` `defaultOpen`-je érvényes). A Beállítások
// „Összecsukott oldalsáv” kapcsolója is ezt állítja.
interface SidebarPreferenceState {
  open: boolean | null;
  setOpen: (open: boolean) => void;
}

export const useSidebarStore = create<SidebarPreferenceState>()(
  persist(
    (set) => ({
      open: null,
      setOpen: (open) => set({ open }),
    }),
    { name: 'reform_studio_sidebar' },
  ),
);

export type SidebarContextProps = {
  state: 'expanded' | 'collapsed';
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

export const SidebarContext = React.createContext<SidebarContextProps | null>(
  null,
);

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw appError('COMMON.INTERNAL', {
      message: 'A useSidebar csak SidebarProvideren belül használható.',
    });
  }
  return context;
}
