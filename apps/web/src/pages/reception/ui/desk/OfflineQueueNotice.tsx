import { CloudOff, RefreshCw } from 'lucide-react';
import React from 'react';
import { useOfflineQueueStore } from '@/entities/check-in';
import { Button } from '@/shared/ui';

interface OfflineQueueNoticeProps {
  onSyncOfflineQueue: () => void;
}

// A várakozó offline beolvasások sávja a recepció fülein (az állapotjelző a fejlécben van).
export const OfflineQueueNotice: React.FC<OfflineQueueNoticeProps> = ({
  onSyncOfflineQueue,
}) => {
  const queueLength = useOfflineQueueStore((state) => state.queue.length);
  if (queueLength === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-warning/35 bg-warning/10 px-3 py-2.5 text-sm text-foreground">
      <CloudOff
        aria-hidden
        strokeWidth={1.75}
        className="size-4 shrink-0 text-warning"
      />
      <p className="min-w-0 flex-1">
        Az offline pufferben {queueLength} beléptetés várakozik
        szinkronizálásra.
      </p>
      <Button variant="secondary" size="sm" onClick={onSyncOfflineQueue}>
        <RefreshCw aria-hidden strokeWidth={1.75} />
        Szinkronizálás most
      </Button>
    </div>
  );
};
