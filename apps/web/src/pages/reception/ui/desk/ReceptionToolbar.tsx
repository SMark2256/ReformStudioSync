import {
  CloudOff,
  FileSignature,
  QrCode,
  RefreshCw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useOfflineQueueStore, useScannerChannelStore } from '@/entities/check-in';
import { notify } from '@/shared/lib/notify';
import { soundFeedback } from '@/shared/lib/sound';
import { Button } from '@/shared/ui';

interface ReceptionToolbarProps {
  /** A csatlakozott vendégmonitorok száma (online állapotban látszik). */
  connectedDisplays: number;
  onSyncOfflineQueue: () => void;
}

// Recepciós eszközsor (minden fülön; a recepción a `PageHeader` alatt): a szkenner, az offline mód és a hang kapcsolói, a Tablet
// Aláíró, alatta a várakozó offline beolvasások sávja.
export const ReceptionToolbar: React.FC<ReceptionToolbarProps> = ({
  connectedDisplays,
  onSyncOfflineQueue,
}) => {
  const { isListening, setListening, lastScannedCode } = useScannerChannelStore();
  const { queue, isOnline, setOnline } = useOfflineQueueStore();
  const [soundEnabled, setSoundEnabled] = useState(() => soundFeedback.isEnabled());

  const toggleScanner = () => {
    const next = !isListening;
    setListening(next);
    notify.info(
      next
        ? 'Folyamatos QR/Vonalkód figyelés bekapcsolva'
        : 'QR/Vonalkód csatorna szüneteltetve',
      next
        ? 'A rendszer minden oldalon folyamatosan figyeli a beérkező QR és vonalkódokat.'
        : 'A háttérbeli automatikus HID leolvasás ideiglenesen kikapcsolva.',
    );
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundFeedback.setEnabled(next);
    notify.info(next ? 'Hangjelzések bekapcsolva' : 'Hangjelzések némítva');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          aria-pressed={isListening}
          onClick={toggleScanner}
          title="Globális QR / Vonalkód Szkenner Csatorna állapota (minden oldalon aktív)"
        >
          <QrCode
            aria-hidden
            strokeWidth={1.75}
            className={isListening ? 'text-success' : 'text-muted-foreground'}
          />
          {isListening
            ? `QR Csatorna: Aktív${lastScannedCode ? ` (#${lastScannedCode})` : ''}`
            : 'QR Csatorna: Szünetel'}
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => setOnline(!isOnline)}
          title="Kattints az Offline / Online mód szimulálásához"
        >
          {isOnline ? (
            <>
              <span aria-hidden className="size-2 rounded-full bg-success" />
              Online ({connectedDisplays} kijelző)
            </>
          ) : (
            <>
              <CloudOff aria-hidden strokeWidth={1.75} className="text-warning" />
              Offline Puffer ({queue.length})
            </>
          )}
        </Button>

        <Button
          variant="secondary"
          size="icon"
          aria-label="Hangjelzés"
          aria-pressed={soundEnabled}
          title="Hangjelzés ki/bekapcsolása"
          onClick={toggleSound}
        >
          {soundEnabled ? (
            <Volume2 aria-hidden strokeWidth={1.75} />
          ) : (
            <VolumeX aria-hidden strokeWidth={1.75} />
          )}
        </Button>

        <Button variant="secondary" size="sm" asChild>
          <Link to="/tablet" title="Tablet dokumentum-kitöltő és aláíró nézet">
            <FileSignature aria-hidden strokeWidth={1.75} />
            Tablet Aláíró
          </Link>
        </Button>
      </div>

      {queue.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-warning/35 bg-warning/10 px-3 py-2.5 text-sm text-foreground">
          <CloudOff
            aria-hidden
            strokeWidth={1.75}
            className="size-4 shrink-0 text-warning"
          />
          <p className="min-w-0 flex-1">
            Az offline pufferben {queue.length} beléptetés várakozik
            szinkronizálásra.
          </p>
          <Button variant="secondary" size="sm" onClick={onSyncOfflineQueue}>
            <RefreshCw aria-hidden strokeWidth={1.75} />
            Szinkronizálás most
          </Button>
        </div>
      )}
    </div>
  );
};
