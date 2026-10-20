import { AuthUserDto, Role } from '@reform/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  accessToken: string | null;
  user: AuthUserDto | null;
  deviceToken: string | null;
  deviceName: string | null;
  setAuth: (accessToken: string, user: AuthUserDto) => void;
  setDeviceAuth: (deviceToken: string, deviceName: string) => void;
  logout: () => void;
}

const DEFAULT_DEMO_RECEPTIONIST: AuthUserDto = {
  id: 'staff-default-1',
  studioId: 'default-studio',
  email: 'admin@reformstudio.hu',
  name: 'ReformStudio Admin & Recepció',
  role: Role.ADMIN,
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: DEFAULT_DEMO_RECEPTIONIST,
      deviceToken: null,
      deviceName: null,
      setAuth: (accessToken, user) => set({ accessToken, user }),
      setDeviceAuth: (deviceToken, deviceName) =>
        set({ deviceToken, deviceName }),
      logout: () =>
        set({
          accessToken: null,
          user: null,
        }),
    }),
    {
      name: 'reform-studio-auth',
    },
  ),
);
