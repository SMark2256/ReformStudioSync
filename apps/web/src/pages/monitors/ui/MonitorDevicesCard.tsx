import { DisplayDeviceDto } from '@reform/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Edit3,
  ExternalLink,
  KeyRound,
  Radio,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import React, { useEffect, useId, useState } from 'react';
import {
  DISPLAY_DEVICES_QUERY_KEY,
  useDisplayDevices,
} from '@/entities/display-device';
import { api, mockStudioEngine } from '@/shared/api';
import { handleAppError } from '@/shared/lib/errors';
import { openGuestMonitorWindow } from '@/shared/lib/monitor-channel';
import { notify } from '@/shared/lib/notify';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmActionButton,
  Input,
  Label,
} from '@/shared/ui';

const sectionTitleClassName = 'text-[13px] font-semibold text-foreground';
const helpTextClassName = 'mt-1 text-[13px] text-muted-foreground';

// A párosító kódok visszaszámlálásához másodpercenként frissülő idő (csak ha van kód).
const useNowTick = (enabled: boolean) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [enabled]);
  return now;
};

// Vendégmonitorok: üdvözlési idő, azonos gépes monitor és különálló kijelzők 6 jegyű kóddal.
export const MonitorDevicesCard: React.FC = () => {
  const greetingInputId = useId();
  const deviceNameInputId = useId();
  const duplicateHintId = useId();
  const [greetingSeconds, setGreetingSeconds] = useState<number>(() =>
    mockStudioEngine.getMonitorGreetingSeconds(),
  );
  const [newDeviceName, setNewDeviceName] = useState('Recepciós Tablet #1');

  const devicesQuery = useDisplayDevices();
  const devices = devicesQuery.data ?? [];
  const nowTick = useNowTick(devices.some((d) => d.pairingCode));
  // A kijelzőműveletek csak a kijelzőlistát érintik.
  const queryClient = useQueryClient();
  const refreshDevices = () =>
    queryClient.invalidateQueries({ queryKey: DISPLAY_DEVICES_QUERY_KEY });

  const initPairingMutation = useMutation({
    mutationFn: (name: string) => api.initDisplayPairing(name),
    onSuccess: (device) => {
      notify.success(
        `6 jegyű párosító kód generálva: ${device.pairingCode}`,
        `Írd be ezt a kódot (10 percig érvényes) a(z) "${device.name}" eszköz /monitor oldalán.`,
      );
      setNewDeviceName('');
      void refreshDevices();
    },
    onError: (err) => {
      handleAppError(err, { title: 'Nem sikerült kódot generálni' });
    },
  });

  const testSignalMutation = useMutation({
    mutationFn: (deviceId?: string) => api.sendMonitorTestSignal(deviceId),
    onSuccess: (res) => {
      notify.success('Teszt jel elküldve', res.message);
      void refreshDevices();
    },
    onError: (err) => {
      handleAppError(err, { title: 'Teszt jel küldése sikertelen' });
    },
  });

  const trimmedCandidate = newDeviceName.trim();
  const duplicateDevice = devices.find(
    (d) =>
      trimmedCandidate.length > 0 &&
      d.name.trim().toLowerCase() === trimmedCandidate.toLowerCase(),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vendégmonitorok és tabletek</CardTitle>
        <CardDescription>
          azonos gépen kód nélkül, különálló eszközön 6 jegyű kóddal
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={greetingInputId}>
            Üdvözlő üzenet megjelenítési ideje (mp)
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id={greetingInputId}
              type="number"
              min={3}
              max={30}
              value={greetingSeconds}
              onChange={(e) => {
                const val = mockStudioEngine.setMonitorGreetingSeconds(
                  Number(e.target.value),
                );
                setGreetingSeconds(val);
                notify.info(`Vendégmonitor üdvözlési idő: ${val} másodperc`);
              }}
              className="w-20 text-right tabular-nums"
            />
            <span className="text-xs text-muted-foreground">
              3–30 mp, alapértelmezett: 5–8 mp
            </span>
          </div>
        </div>

        <section className="border-t border-border pt-4">
          <h3 className={sectionTitleClassName}>
            Másodlagos monitor ugyanezen a gépen
          </h3>
          <p className={helpTextClassName}>
            Ezen a gépen be vagy jelentkezve, ezért a{' '}
            <code className="font-mono text-xs">/monitor</code> oldal párosító
            kód nélkül működik. Nyisd meg új ablakban, húzd át a vendég felé
            néző kijelzőre, és kapcsold teljes képernyőre.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={testSignalMutation.isPending}
              onClick={() => testSignalMutation.mutate(undefined)}
            >
              <Radio aria-hidden strokeWidth={1.75} />
              Teszt jel küldése a kijelzőkre
            </Button>
            <Button variant="secondary" onClick={openGuestMonitorWindow}>
              <ExternalLink aria-hidden strokeWidth={1.75} />
              Vendégmonitor megnyitása új ablakban
            </Button>
          </div>
        </section>

        <section className="border-t border-border pt-4">
          <h3 className={sectionTitleClassName}>
            Különálló kijelző párosítása 6 jegyű kóddal
          </h3>
          <p className={helpTextClassName}>
            Egy különálló tableten (ahol nem vagy bejelentkezve) a{' '}
            <code className="font-mono text-xs">/monitor</code> oldal zárolva
            marad, amíg be nem írod az itt generált kódot. A kód 10 percig
            érvényes, a párosítás bármikor megszakítható.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!trimmedCandidate) {
                notify.warning(
                  'Hiányzó eszköznév',
                  'Adj nevet a párosítandó kijelzőnek.',
                );
                return;
              }
              if (duplicateDevice) {
                notify.error(
                  'Ez a kijelzőnév már foglalt',
                  `Már létezik "${duplicateDevice.name}" nevű monitor. Ugyanolyan nevű monitort nem lehet kétszer létrehozni.`,
                );
                return;
              }
              initPairingMutation.mutate(trimmedCandidate);
            }}
            className="mt-3 flex flex-col gap-1.5"
          >
            <Label htmlFor={deviceNameInputId}>Eszköz neve</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id={deviceNameInputId}
                value={newDeviceName}
                onChange={(e) => setNewDeviceName(e.target.value)}
                placeholder="Pl. Pult iPad #1"
                aria-invalid={Boolean(duplicateDevice)}
                aria-describedby={duplicateDevice ? duplicateHintId : undefined}
                className="sm:max-w-sm"
              />
              <Button
                type="submit"
                variant="primary"
                disabled={
                  initPairingMutation.isPending ||
                  !trimmedCandidate ||
                  Boolean(duplicateDevice)
                }
              >
                <KeyRound aria-hidden strokeWidth={1.75} />
                Párosító kód generálása
              </Button>
            </div>
            {duplicateDevice && (
              <p id={duplicateHintId} className="text-xs text-destructive">
                Már létezik „{duplicateDevice.name}” nevű kijelző. Adj meg másik
                nevet, vagy kezeld a meglévőt alább.
              </p>
            )}
          </form>

          {devices.length === 0 ? (
            <p className="mt-4 py-7 text-center text-[13px] text-muted-foreground">
              Még nincs párosított tablet vagy folyamatban lévő párosító kód.
            </p>
          ) : (
            <ul
              aria-label="Kijelzők"
              className="mt-4 divide-y divide-border rounded-lg border border-border"
            >
              {devices.map((dev) => (
                <DeviceRow
                  key={dev.id}
                  device={dev}
                  nowTick={nowTick}
                  isTestSignalPending={testSignalMutation.isPending}
                  onTestSignal={() => testSignalMutation.mutate(dev.id)}
                  onRefreshDevices={refreshDevices}
                />
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
};

interface DeviceRowProps {
  device: DisplayDeviceDto;
  nowTick: number;
  isTestSignalPending: boolean;
  onTestSignal: () => void;
  onRefreshDevices: () => void;
}

const DeviceRow: React.FC<DeviceRowProps> = ({
  device: dev,
  nowTick,
  isTestSignalPending,
  onTestSignal,
  onRefreshDevices,
}) => {
  const renameInputId = useId();
  // `null`: nincs átnevezés folyamatban.
  const [editingName, setEditingName] = useState<string | null>(null);
  const isEditing = editingName !== null;

  const regenerateCodeMutation = useMutation({
    mutationFn: (deviceId: string) =>
      api.regenerateDisplayPairingCode(deviceId),
    onSuccess: (device) => {
      notify.info(
        `Új 6 jegyű párosító kód generálva: ${device.pairingCode}`,
        `A korábbi párosítás érvényét vesztette. Írd be az új kódot a(z) "${device.name}" eszközön.`,
      );
      onRefreshDevices();
    },
    onError: (err) => {
      handleAppError(err, { title: 'Kód újragenerálása sikertelen' });
    },
  });

  const renameDeviceMutation = useMutation({
    mutationFn: (vars: { deviceId: string; name: string }) =>
      api.renameDisplayDevice(vars.deviceId, vars.name),
    onSuccess: (device) => {
      notify.success('Kijelző átnevezve', `Új név: ${device.name}`);
      setEditingName(null);
      onRefreshDevices();
    },
    onError: (err) => {
      handleAppError(err, { title: 'Átnevezés sikertelen' });
    },
  });

  const deleteDeviceMutation = useMutation({
    mutationFn: (deviceId: string) => api.deleteDisplayDevice(deviceId),
    onSuccess: () => {
      notify.warning(
        'Kijelző / Párosítás eltávolítva',
        'A párosító kód vagy eszköz törlésre került és a kapcsolat megszakadt.',
      );
      onRefreshDevices();
    },
    onError: (err) => {
      handleAppError(err, { title: 'Törlés sikertelen' });
    },
  });

  const expiresMs = dev.pairingExpiresAt
    ? new Date(dev.pairingExpiresAt).getTime()
    : null;
  const remainingSec =
    dev.pairingCode && expiresMs
      ? Math.max(0, Math.floor((expiresMs - nowTick) / 1000))
      : null;
  const isExpired =
    Boolean(dev.pairingCode) &&
    (dev.status === 'EXPIRED' || (remainingSec !== null && remainingSec <= 0));
  const isAwaitingPairing = Boolean(dev.pairingCode) && !isExpired;
  const isPaired = !dev.pairingCode;

  const countdown =
    remainingSec !== null
      ? `${String(Math.floor(remainingSec / 60)).padStart(2, '0')}:${String(remainingSec % 60).padStart(2, '0')}`
      : '';

  return (
    <li className="space-y-3 px-3.5 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          {isEditing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = (editingName ?? '').trim();
                if (!trimmed) return;
                renameDeviceMutation.mutate({
                  deviceId: dev.id,
                  name: trimmed,
                });
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <Label htmlFor={renameInputId} className="sr-only">
                {dev.name} új neve
              </Label>
              <Input
                id={renameInputId}
                value={editingName ?? ''}
                onChange={(e) => setEditingName(e.target.value)}
                autoFocus
                className="w-auto min-w-0 flex-1 sm:max-w-xs"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setEditingName(null);
                }}
              >
                Mégse
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={renameDeviceMutation.isPending}
              >
                Mentés
              </Button>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                {dev.name}
              </span>
              {isPaired && <Badge variant="success">Párosítva, aktív</Badge>}
              {isAwaitingPairing && (
                <Badge variant="warning">Párosításra vár ({countdown})</Badge>
              )}
              {isExpired && <Badge variant="destructive">Kód lejárt</Badge>}
            </div>
          )}

          {isPaired ? (
            <div className="space-y-0.5 text-xs text-muted-foreground">
              {dev.pairedAt && (
                <p>
                  Párosítva:{' '}
                  <span className="text-foreground">
                    {new Date(dev.pairedAt).toLocaleString('hu-HU')}
                  </span>
                </p>
              )}
              <p>
                Utolsó aktivitás:{' '}
                {dev.lastSeenAt ? (
                  <span className="text-foreground">
                    {new Date(dev.lastSeenAt).toLocaleString('hu-HU')} –{' '}
                    {dev.lastActivityType ?? 'Sikeresen párosítva'}
                  </span>
                ) : (
                  'még nem volt esemény'
                )}
              </p>
            </div>
          ) : isAwaitingPairing ? (
            <p className="text-xs text-muted-foreground">
              Még nincs párosítva. Nyisd meg a másik eszközön a{' '}
              <code className="font-mono">/monitor</code> oldalt, és írd be a 6
              jegyű kódot.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              A párosító kód 10 perc után lejárt. Kérhetsz új kódot, vagy
              törölheted a bejegyzést.
            </p>
          )}
        </div>

        {isAwaitingPairing && (
          <div className="rounded-md border border-border bg-muted px-3.5 py-2 text-center">
            <span className="block text-xs font-semibold text-muted-foreground">
              Párosító kód
            </span>
            <span className="font-mono text-lg font-semibold tracking-[0.25em] text-foreground">
              {dev.pairingCode}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {isPaired && (
          <Button
            variant="secondary"
            size="sm"
            disabled={isTestSignalPending}
            onClick={onTestSignal}
            aria-label={`Teszt jel küldése: ${dev.name}`}
          >
            <Radio aria-hidden strokeWidth={1.75} />
            Teszt jel
          </Button>
        )}
        {!isEditing && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setEditingName(dev.name);
            }}
            aria-label={`${dev.name} átnevezése`}
          >
            <Edit3 aria-hidden strokeWidth={1.75} />
            Átnevezés
          </Button>
        )}
        {isPaired ? (
          <ConfirmActionButton
            size="sm"
            disabled={regenerateCodeMutation.isPending}
            aria-label={`${dev.name}: párosítás bontása és új kód`}
            confirmLabel="Párosítás bontása"
            description={`A(z) „${dev.name}” kijelző párosítása megszűnik, és új 6 jegyű kód készül hozzá.`}
            onConfirm={() => regenerateCodeMutation.mutate(dev.id)}
          >
            <RefreshCw aria-hidden strokeWidth={1.75} />
            Párosítás bontása, új kód
          </ConfirmActionButton>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            disabled={regenerateCodeMutation.isPending}
            onClick={() => regenerateCodeMutation.mutate(dev.id)}
            aria-label={`Új kód kérése: ${dev.name}`}
          >
            <RefreshCw aria-hidden strokeWidth={1.75} />
            Új kód kérése
          </Button>
        )}
        <ConfirmActionButton
          size="sm"
          disabled={deleteDeviceMutation.isPending}
          aria-label={`${dev.name} ${isAwaitingPairing ? 'párosításának megszakítása' : 'törlése'}`}
          confirmLabel={
            isAwaitingPairing ? 'Párosítás megszakítása' : 'Kijelző törlése'
          }
          description={`A(z) „${dev.name}” bejegyzés törlődik, és a kapcsolat megszakad.`}
          onConfirm={() => deleteDeviceMutation.mutate(dev.id)}
        >
          <Trash2 aria-hidden strokeWidth={1.75} />
          {isAwaitingPairing ? 'Párosítás megszakítása' : 'Törlés'}
        </ConfirmActionButton>
      </div>
    </li>
  );
};
