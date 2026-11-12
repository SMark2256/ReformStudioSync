import { FileSignature, Volume2, VolumeX } from 'lucide-react';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useOfflineQueueStore, useScannerChannelStore } from '@/entities/check-in';
import { notify } from '@/shared/lib/notify';
import { soundFeedback } from '@/shared/lib/sound';
import { cn } from '@/shared/lib/utils';
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui';

const TABLET_TITLE = 'Tablet dokumentum-kitöltő és aláíró nézet';
const CONNECTION_TITLE = 'Kattints az Offline / Online mód szimulálásához';

const StatusDot: React.FC<{ className: string }> = ({ className }) => (
  <span aria-hidden className={cn('size-2 shrink-0 rounded-full', className)} />
);

// A szkenner, az offline mód és a hang állapota és kapcsolói (a két nézet közös logikája).
const useReceptionStatus = (connectedDisplays: number) => {
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

  return {
    isListening,
    scannerTitle: isListening
      ? `QR / vonalkód csatorna: aktív minden oldalon${lastScannedCode ? ` (utolsó: #${lastScannedCode})` : ''}`
      : 'QR / vonalkód csatorna: szünetel',
    toggleScanner,
    isOnline,
    connectionLabel: isOnline
      ? `Online (${connectedDisplays} kijelző)`
      : `Offline puffer (${queue.length})`,
    connectionDotClassName: isOnline ? 'bg-success' : 'bg-warning',
    toggleOnline: () => setOnline(!isOnline),
    soundEnabled,
    toggleSound,
  };
};

interface ReceptionHeaderStatusProps {
  /** A csatlakozott vendégmonitorok száma (online állapotban látszik). */
  connectedDisplays: number;
}

// A recepció kapcsolatjelzői a fejlécben (UI-specifikáció 4.3): QR csatorna, online / offline
// (kijelzők), hang, Tablet Aláíró. 1280 px-től pötty + rövid felirat egy sorban, alatta csak a
// pöttyök látszanak, a feliratok és a műveletek egy legördülőben.
export const ReceptionHeaderStatus: React.FC<ReceptionHeaderStatusProps> = ({
  connectedDisplays,
}) => {
  const status = useReceptionStatus(connectedDisplays);
  const scannerDotClassName = status.isListening
    ? 'bg-success'
    : 'bg-muted-foreground';
  const SoundIcon = status.soundEnabled ? Volume2 : VolumeX;

  return (
    <>
      <div className="flex items-center gap-2 max-xl:hidden">
        <Button
          size="sm"
          aria-pressed={status.isListening}
          title={status.scannerTitle}
          onClick={status.toggleScanner}
        >
          <StatusDot className={scannerDotClassName} />
          QR csatorna
        </Button>
        <Button size="sm" title={CONNECTION_TITLE} onClick={status.toggleOnline}>
          <StatusDot className={status.connectionDotClassName} />
          {status.connectionLabel}
        </Button>
        <Button
          size="sm"
          className="px-2"
          aria-label="Hangjelzés"
          aria-pressed={status.soundEnabled}
          title="Hangjelzés ki/bekapcsolása"
          onClick={status.toggleSound}
        >
          <SoundIcon aria-hidden strokeWidth={1.75} />
        </Button>
        <Button size="sm" asChild>
          <Link to="/tablet" aria-label="Tablet Aláíró" title={TABLET_TITLE}>
            <FileSignature aria-hidden strokeWidth={1.75} />
            Tablet
          </Link>
        </Button>
      </div>

      <div className="xl:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              className="gap-1.5 px-2.5"
              aria-label={`Kapcsolatok: QR csatorna ${status.isListening ? 'aktív' : 'szünetel'}, ${status.connectionLabel}, hangjelzés ${status.soundEnabled ? 'be' : 'ki'}`}
            >
              <StatusDot className={scannerDotClassName} />
              <StatusDot className={status.connectionDotClassName} />
              <SoundIcon aria-hidden strokeWidth={1.75} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            <DropdownMenuLabel>Kapcsolatok</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={status.isListening}
              onCheckedChange={status.toggleScanner}
            >
              QR csatorna
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={status.isOnline}
              onCheckedChange={status.toggleOnline}
            >
              {status.connectionLabel}
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={status.soundEnabled}
              onCheckedChange={status.toggleSound}
            >
              Hangjelzés
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem inset asChild>
              <Link to="/tablet" title={TABLET_TITLE}>
                Tablet Aláíró
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
};
