import {
  MonitorAuthRejectedPayload,
  MonitorCheckInPayload,
  MonitorCheckInRevokedPayload,
  MonitorDeviceRevokedPayload,
  MonitorTestPingPayload,
} from '@reform/shared';
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  LogOut,
  Maximize2,
  Monitor,
  QrCode,
  Radio,
  ShieldCheck,
  Smartphone,
  Wifi,
  XCircle,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  MonitorConnectionStatus,
  useMonitorChannel,
} from '@/shared/lib/monitor-channel';
import { api } from '@/shared/api';
import { APP_VERSION_LABEL } from '@/shared/config';
import { mockStudioEngine } from '@/shared/api';
import { notify } from '@/shared/lib/notify';
import { soundFeedback } from '@/shared/lib/sound';
import { useAuthStore } from '@/shared/auth';
import { useScannerChannelStore } from '@/entities/check-in';
import { MonitorDisplayCard } from '@/entities/check-in';
import { Button, Input } from '@/shared/ui';

// A Vendégmonitor nem követi a témát és a kiemelő színt (theme-support.mdc kivétel): a közös
// gombok és mezők itt a fix sötét/smaragd színeket kapják.
const monitorPrimaryButtonClassName =
  'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:ring-white focus-visible:ring-offset-slate-950';
const monitorSecondaryButtonClassName =
  'border-slate-700 bg-slate-900 text-slate-200 shadow-none hover:bg-slate-800 hover:text-white focus-visible:ring-emerald-400 focus-visible:ring-offset-slate-950';

const chipBaseClassName =
  'inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium';
const monitorChipClassName = {
  on: `${chipBaseClassName} border-emerald-500/30 bg-emerald-500/15 text-emerald-300`,
  off: `${chipBaseClassName} border-slate-700 bg-slate-800 text-slate-400`,
  warn: `${chipBaseClassName} border-amber-500/30 bg-amber-500/15 text-amber-300`,
};

// Az „élő” felirat csak akkor látszik, ha a szerver ténylegesen beléptette a kijelzőt
// a stúdió szobájába (TICKET-32); a helyi BroadcastChannel mindig működik.
const localOnlyChip = {
  className: monitorChipClassName.warn,
  label: 'Csak helyi szinkron',
};
const connectionChip: Record<
  MonitorConnectionStatus,
  { className: string; label: string }
> = {
  live: {
    className: monitorChipClassName.on,
    label: 'Élő Socket + Helyi Szinkron Aktív',
  },
  connecting: {
    className: monitorChipClassName.off,
    label: 'Kapcsolódás a szerverhez…',
  },
  offline: localOnlyChip,
  idle: localOnlyChip,
};

export const MonitorPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    accessToken,
    user,
    deviceToken,
    deviceName,
    setDeviceAuth,
    clearDeviceAuth,
  } = useAuthStore();
  const { isListening: isScannerListening, lastScannedCode } =
    useScannerChannelStore();

  const isStaffAuthenticated = Boolean(accessToken);
  const isDevicePaired = Boolean(deviceToken);
  const isAuthorized = isStaffAuthenticated || isDevicePaired;

  const [activeResult, setActiveResult] =
    useState<MonitorCheckInPayload | null>(null);
  const [revokedBanner, setRevokedBanner] =
    useState<MonitorCheckInRevokedPayload | null>(null);
  const [testPingBanner, setTestPingBanner] =
    useState<MonitorTestPingPayload | null>(null);

  const [pairingCodeInput, setPairingCodeInput] = useState<string>('');
  const [isPairingSubmitting, setIsPairingSubmitting] =
    useState<boolean>(false);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [confirmUnpair, setConfirmUnpair] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(
    Boolean(typeof document !== 'undefined' && document.fullscreenElement),
  );

  const resetTimerRef = useRef<number | null>(null);

  // Biztosítjuk, hogy az URL-ben soha ne maradjon párosítási kód vagy query paraméter
  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState({}, '', '/monitor');
    }
  }, []);

  const handleCheckInResult = useCallback((payload: MonitorCheckInPayload) => {
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    setRevokedBanner(null);
    setTestPingBanner(null);
    setActiveResult(payload);

    if (payload.status === 'SUCCESS') {
      soundFeedback.playSuccess();
    } else if (payload.status === 'DUPLICATE') {
      soundFeedback.playWarning();
    } else {
      soundFeedback.playError();
    }

    const durationSeconds =
      payload.greetingSeconds ?? mockStudioEngine.getMonitorGreetingSeconds();

    resetTimerRef.current = window.setTimeout(() => {
      setActiveResult(null);
    }, durationSeconds * 1000);
  }, []);

  const handleCheckInRevoked = useCallback(
    (payload: MonitorCheckInRevokedPayload) => {
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
      setActiveResult(null);
      setTestPingBanner(null);
      setRevokedBanner(payload);
      soundFeedback.playWarning();

      resetTimerRef.current = window.setTimeout(() => {
        setRevokedBanner(null);
      }, 6000);
    },
    [],
  );

  const handleTestPing = useCallback((payload: MonitorTestPingPayload) => {
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    setActiveResult(null);
    setRevokedBanner(null);
    setTestPingBanner(payload);
    soundFeedback.playSuccess();

    resetTimerRef.current = window.setTimeout(() => {
      setTestPingBanner(null);
    }, 4500);
  }, []);

  /** A párosítás helyi törlése: a monitor a kódbekérő képernyőre vált. */
  const resetDevicePairing = useCallback(() => {
    clearDeviceAuth();
    setActiveResult(null);
    setRevokedBanner(null);
    setTestPingBanner(null);
    setConfirmUnpair(false);
  }, [clearDeviceAuth]);

  /** A szerver vagy a recepció bontotta a párosítást (munkatársi munkamenetnél nem). */
  const dropDevicePairing = useCallback(
    (reason: string) => {
      if (isStaffAuthenticated) return;
      resetDevicePairing();
      soundFeedback.playWarning();
      notify.warning('Kijelző párosítása megszakadt', reason);
    },
    [isStaffAuthenticated, resetDevicePairing],
  );

  const handleDeviceRevoked = useCallback(
    (payload: MonitorDeviceRevokedPayload) => {
      dropDevicePairing(
        payload.reason ??
          'A recepcióról bontották vagy törölték ennek a kijelzőnek a párosítását.',
      );
    },
    [dropDevicePairing],
  );

  // Munkatársi tokennél (pl. lejárt munkamenet) a szerver szintén DEVICE_TOKEN_INVALID-ot
  // küldhet: ott a párosítás marad (`dropDevicePairing`), csak a kapcsolat szakad meg.
  const handleAuthRejected = useCallback(
    (payload: MonitorAuthRejectedPayload) => {
      if (payload.code !== 'AUTH.DEVICE_TOKEN_INVALID') return;
      dropDevicePairing(
        'A szerver már nem ismeri ezt a kijelzőt. A további használathoz új 6 jegyű párosító kód szükséges.',
      );
    },
    [dropDevicePairing],
  );

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('keydown', onKeyDown);
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    };
  }, []);

  const { connectionStatus, wakeLockActive } = useMonitorChannel({
    onMonitorCheckIn: handleCheckInResult,
    onMonitorCheckInRevoked: handleCheckInRevoked,
    onTestPing: handleTestPing,
    onDeviceRevoked: handleDeviceRevoked,
    onAuthRejected: handleAuthRejected,
    enableWakeLock: isAuthorized,
    enabled: isAuthorized,
    displayOnly: true,
  });

  const handlePairSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = pairingCodeInput.replace(/\D/g, '').trim();
    if (cleaned.length !== 6) {
      setPairingError('Kérjük, adj meg pontosan 6 számjegyet!');
      return;
    }

    setIsPairingSubmitting(true);
    setPairingError(null);
    try {
      const res = await api.verifyDisplayPairing(cleaned);
      setDeviceAuth(res.deviceToken, res.device.name, res.device.id);
      setPairingCodeInput('');
      soundFeedback.playSuccess();
      notify.success(
        'Kijelző sikeresen párosítva!',
        `Eszköz neve: ${res.device.name}`,
      );
    } catch (err) {
      const msg = (err as Error).message;
      setPairingError(msg);
      soundFeedback.playError();
      notify.error('Párosítás sikertelen', msg);
    } finally {
      setIsPairingSubmitting(false);
    }
  };

  const handleUnpairDevice = async () => {
    if (!deviceToken) return;
    // Előbb a helyi leválasztás (akkor is, ha a szerver nem elérhető): a törölt `deviceId`
    // után a szerver visszavonás-üzenetét a csatorna már elnyeli, így nincs dupla jelzés,
    // akkor sem, ha az üzenet a HTTP-válasz előtt érkezik.
    resetDevicePairing();
    try {
      await api.unpairSelfDevice(deviceToken);
    } catch {
      // A helyi leválasztás már megtörtént.
    }
    notify.info(
      'Párosítás megszakítva',
      'Az eszköz le lett választva. A további használathoz új 6 jegyű párosító kód szükséges.',
    );
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement && !isFullscreen) {
      setIsFullscreen(true);
      document.documentElement.requestFullscreen().catch(() => {
        // Fallback ha a böngésző blokkolja a natív fullscreen API-t: a header akkor is eltűnik
      });
    } else {
      setIsFullscreen(false);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  // Ha az eszközön nincs bejelentkezett recepciós/admin ÉS nincs párosítva sem -> Kötelező 6 jegyű kód bekérő képernyő
  if (!isAuthorized) {
    return (
      <div className="monitor-invariant flex min-h-screen flex-col justify-between bg-slate-950 p-4 text-white sm:p-8">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="flex size-9 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/15 text-[13px] font-bold text-emerald-300"
            >
              RS
            </span>
            <div>
              <span className="text-sm font-semibold text-white">
                ReformStudioSync
              </span>
              <span className="block text-xs text-slate-400">
                Önálló Vendégmonitor & Tablet Kijelző
              </span>
            </div>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/login')}
            className={monitorSecondaryButtonClassName}
          >
            <ArrowLeft aria-hidden strokeWidth={1.75} />
            Megszakítás / Belépés
          </Button>
        </header>

        <main className="mx-auto my-auto w-full max-w-lg">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 sm:p-10">
            <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/15">
              <KeyRound
                aria-hidden
                strokeWidth={1.75}
                className="size-7 text-emerald-400"
              />
            </div>

            <div className="text-center">
              <span className={monitorChipClassName.warn}>
                <Smartphone
                  aria-hidden
                  strokeWidth={1.75}
                  className="size-3.5"
                />
                Kijelző párosítás szükséges
              </span>
              <h1 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">
                Írd be a 6 jegyű párosító kódot
              </h1>
              <p className="mt-2 text-sm text-slate-300">
                Ezen az eszközön nem vagy bejelentkezve recepciósként. A
                Vendégmonitor aktiválásához nyisd meg a recepción a{' '}
                <strong className="font-semibold text-emerald-300">
                  Bérletek és termékek
                </strong>{' '}
                oldalt, generálj egy kódot, és írd be ide:
              </p>
            </div>

            <form onSubmit={handlePairSubmit} className="mt-6 space-y-4">
              <Input
                type="text"
                inputMode="numeric"
                autoFocus
                maxLength={6}
                aria-label="6 jegyű párosító kód"
                aria-invalid={Boolean(pairingError)}
                value={pairingCodeInput}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setPairingCodeInput(digits);
                  if (pairingError) setPairingError(null);
                }}
                placeholder="000000"
                className="h-auto rounded-lg border-2 border-slate-700 bg-slate-950 px-4 py-4 text-center font-mono text-3xl font-semibold tracking-[0.35em] text-white placeholder:text-slate-700 focus-visible:border-emerald-500 focus-visible:ring-emerald-500/20 coarse:h-auto coarse:text-3xl sm:text-4xl"
              />

              {pairingError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-200"
                >
                  <XCircle
                    aria-hidden
                    strokeWidth={1.75}
                    className="mt-0.5 size-4 shrink-0 text-rose-400"
                  />
                  <span>{pairingError}</span>
                </div>
              )}

              <div className="flex flex-col gap-2.5 pt-1 sm:flex-row">
                {pairingCodeInput.length > 0 && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setPairingCodeInput('');
                      setPairingError(null);
                    }}
                    className={monitorSecondaryButtonClassName}
                  >
                    Törlés
                  </Button>
                )}
                <Button
                  type="submit"
                  variant="primary"
                  disabled={
                    isPairingSubmitting || pairingCodeInput.trim().length !== 6
                  }
                  className={`${monitorPrimaryButtonClassName} flex-1`}
                >
                  <CheckCircle2 aria-hidden strokeWidth={1.75} />
                  {isPairingSubmitting
                    ? 'Párosítás folyamatban...'
                    : 'Kijelző párosítása és indítása'}
                </Button>
              </div>
            </form>

            <div className="mt-6 space-y-1.5 border-t border-slate-800 pt-4 text-xs text-slate-400">
              <p>
                <strong className="font-semibold text-slate-200">
                  Ugyanazon a gépen használod?
                </strong>{' '}
                Ha ebben a böngészőben bejelentkezel a recepciós felületre, a
                Vendégmonitor kód nélkül azonnal működik.
              </p>
              <p>
                <strong className="font-semibold text-slate-200">
                  Biztonságos párosítás:
                </strong>{' '}
                A kód 10 percig érvényes, és a recepcióról bármikor
                megszakítható.
              </p>
            </div>
          </div>
        </main>

        <footer className="text-center text-xs text-slate-500">
          ReformStudioSync · valós idejű ügyfélkijelző
        </footer>
      </div>
    );
  }

  return (
    <div className="monitor-invariant flex min-h-screen flex-col justify-between bg-slate-950 p-4 text-white sm:p-8">
      {!isFullscreen && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {isStaffAuthenticated && (
              <Button
                variant="secondary"
                size="sm"
                asChild
                className={monitorSecondaryButtonClassName}
              >
                <Link to="/reception">
                  <ArrowLeft aria-hidden strokeWidth={1.75} />
                  Recepció
                </Link>
              </Button>
            )}
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Monitor
                aria-hidden
                strokeWidth={1.75}
                className="size-4 text-emerald-400"
              />
              <span>
                Üzemmód:{' '}
                <strong className="font-semibold text-slate-200">
                  {isStaffAuthenticated
                    ? `Recepciós PC Másodlagos Kijelző (${user?.name ?? 'Bejelentkezve'})`
                    : `Párosított Önálló Kijelző (${deviceName ?? 'Tablet'})`}
                </strong>
              </span>
              <span className={monitorChipClassName.on}>{APP_VERSION_LABEL}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={
                isScannerListening
                  ? monitorChipClassName.on
                  : monitorChipClassName.off
              }
              title="A kijelző folyamatosan figyeli a csatlakoztatott QR / vonalkód olvasót"
            >
              <QrCode aria-hidden strokeWidth={1.75} className="size-3.5" />
              {isScannerListening
                ? `QR Szkenner Csatorna Aktív${lastScannedCode ? ` (#${lastScannedCode})` : ''}`
                : 'QR Szkenner Szünetel'}
            </span>

            <span className={connectionChip[connectionStatus].className}>
              <Wifi aria-hidden strokeWidth={1.75} className="size-3.5" />
              {connectionChip[connectionStatus].label}
            </span>

            {wakeLockActive && (
              <span
                className={`${monitorChipClassName.off} hidden sm:inline-flex`}
              >
                <ShieldCheck
                  aria-hidden
                  strokeWidth={1.75}
                  className="size-3.5 text-emerald-400"
                />
                WakeLock Aktív
              </span>
            )}

            {isDevicePaired &&
              (!confirmUnpair ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirmUnpair(true)}
                  className={monitorSecondaryButtonClassName}
                >
                  <LogOut aria-hidden strokeWidth={1.75} />
                  Párosítás megszakítása
                </Button>
              ) : (
                <div className="inline-flex flex-wrap items-center gap-2 rounded-md border border-rose-500/50 bg-slate-900 px-2.5 py-1 text-xs">
                  <span className="font-semibold text-rose-300">
                    Leválasztod a kijelzőt?
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirmUnpair(false)}
                    className={monitorSecondaryButtonClassName}
                  >
                    Mégse
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleUnpairDevice}
                    className={monitorPrimaryButtonClassName}
                  >
                    Párosítás bontása
                  </Button>
                </div>
              ))}

            <Button
              variant="primary"
              size="sm"
              onClick={toggleFullscreen}
              className={monitorPrimaryButtonClassName}
            >
              <Maximize2 aria-hidden strokeWidth={1.75} />
              Teljes Képernyő
            </Button>
          </div>
        </header>
      )}

      {testPingBanner && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-emerald-400/50 bg-emerald-500/20 px-5 py-3.5 text-white">
          <div className="flex items-center gap-3">
            <Radio
              aria-hidden
              strokeWidth={1.75}
              className="size-6 text-emerald-300"
            />
            <div>
              <p className="text-sm font-semibold text-emerald-200">
                Teszt jel sikeresen fogadva
              </p>
              <p className="text-xs text-emerald-100">
                {testPingBanner.message} (Küldte:{' '}
                {testPingBanner.senderName ?? 'Recepció'})
              </p>
            </div>
          </div>
          <span className="font-mono text-xs text-emerald-200">
            {new Date(testPingBanner.timestamp).toLocaleTimeString('hu-HU')}
          </span>
        </div>
      )}

      <main className="my-auto">
        <MonitorDisplayCard
          activeResult={activeResult}
          revokedBanner={revokedBanner}
        />
      </main>
    </div>
  );
};
