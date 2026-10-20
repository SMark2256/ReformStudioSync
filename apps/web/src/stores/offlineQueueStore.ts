import { OfflineScanItemDto } from '@reform/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface OfflineQueueState {
  queue: OfflineScanItemDto[];
  isOnline: boolean;
  setOnline: (online: boolean) => void;
  enqueueScan: (barcode: string) => OfflineScanItemDto;
  removeItems: (keys: string[]) => void;
  clearQueue: () => void;
}

export const useOfflineQueueStore = create<OfflineQueueState>()(
  persist(
    (set) => ({
      queue: [],
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      setOnline: (isOnline) => set({ isOnline }),
      enqueueScan: (barcode: string) => {
        const item: OfflineScanItemDto = {
          idempotencyKey:
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `offline-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          barcode: barcode.trim(),
          scannedAt: new Date().toISOString(),
        };
        set((state) => ({ queue: [...state.queue, item] }));
        return item;
      },
      removeItems: (keys) =>
        set((state) => ({
          queue: state.queue.filter((i) => !keys.includes(i.idempotencyKey)),
        })),
      clearQueue: () => set({ queue: [] }),
    }),
    {
      name: 'reform-studio-offline-queue',
    },
  ),
);
