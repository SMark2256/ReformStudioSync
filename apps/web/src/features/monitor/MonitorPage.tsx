import {
  CheckInResultPayload,
  CheckInRevokedPayload,
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
  Sparkles,
  Wifi,
  XCircle,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMonitorChannel } from '../../hooks/useMonitorChannel';
import { api } from '../../lib/api';
import { mockStudioEngine } from '../../lib/mock-engine';
import { notify } from '../../lib/notify';
import { soundFeedback } from '../../lib/sound';
import { useAuthStore } from '../../stores/authStore';
import { useScannerChannelStore } from '../../stores/scannerChannelStore';
import { MonitorDisplayCard } from './MonitorDisplayCard';

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

  const [activeResult, setActiveResult] = useState<CheckInResultPayload | null>(
    null,
  );
  const [revokedBanner, setRevokedBanner] =
    useState<CheckInRevokedPayload | null>(null);
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

  const handleCheckInResult = useCallback((payload: CheckInResultPayload) => {
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    setRevokedBanner(null);
    setTestPingBanner(null);
    setActiveResult(payload);

    if (payload.status === 'SUCCESS') {
      soundFeedback.playSuccess();
    } else if (payload.status === 'DUPLICATE_SCAN') {
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

  const handleCheckInRevoked = useCallback((payload: CheckInRevokedPayload) => {
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    setActiveResult(null);
    setTestPingBanner(null);
    setRevokedBanner(payload);
    soundFeedback.playWarning();

    resetTimerRef.current = window.setTimeout(() => {
      setRevokedBanner(null);
    }, 6000);
  }, []);

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

  const handleDeviceRevoked = useCallback(
    (payload: MonitorDeviceRevokedPayload) => {
      if (isStaffAuthenticated) return;
      clearDeviceAuth();
      setActiveResult(null);
      setRevokedBanner(null);
      setTestPingBanner(null);
      setConfirmUnpair(false);
      soundFeedback.playWarning();
      notify.warning(
        'Kijelző párosítása megszakadt',
        payload.reason ??
          'A recepcióról bontották vagy törölték ennek a kijelzőnek a párosítását.',
      );
    },
    [isStaffAuthenticated, clearDeviceAuth],
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

  const { isConnected, wakeLockActive } = useMonitorChannel({
    onCheckInResult: handleCheckInResult,
    onCheckInRevoked: handleCheckInRevoked,
    onTestPing: handleTestPing,
    onDeviceRevoked: handleDeviceRevoked,
    enableWakeLock: isAuthorized,
    enabled: isAuthorized,
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
    try {
      await api.unpairSelfDevice(deviceToken);
    } catch {
      // Helyi leválasztást akkor is végrehajtjuk, ha a szerver nem elérhető
    }
    clearDeviceAuth();
    setConfirmUnpair(false);
    setActiveResult(null);
    setRevokedBanner(null);
    setTestPingBanner(null);
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
      <div className="monitor-invariant min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-white p-4 sm:p-8 flex flex-col justify-between">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-500/30">
              <Sparkles className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <span className="text-sm font-extrabold tracking-tight text-white">
                ReformStudioSync
              </span>
              <span className="block text-[11px] text-slate-400">
                Önálló Vendégmonitor & Tablet Kijelző
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/login')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/80 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Megszakítás / Belépés
          </button>
        </header>

        <main className="my-auto mx-auto w-full max-w-lg">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 sm:p-10 shadow-2xl backdrop-blur-md">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/30">
              <KeyRound className="h-8 w-8 text-emerald-400" />
            </div>

            <div className="text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-300">
                <Smartphone className="h-3.5 w-3.5" />
                Kijelző Párosítás Szükséges
              </span>
              <h1 className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                Írd be a 6 jegyű párosító kódot
              </h1>
              <p className="mt-2 text-xs sm:text-sm text-slate-300 leading-relaxed">
                Ezen az eszközön nem vagy bejelentkezve recepciósként. A Vendégmonitor
                aktiválásához nyisd meg a Recepciós Pult{' '}
                <strong className="text-emerald-300">
                  „Sablonok & Monitorok”
                </strong>{' '}
                fülét, generálj egy kódot, és üsd be ide:
              </p>
            </div>

            <form onSubmit={handlePairSubmit} className="mt-6 space-y-4">
              <div>
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  maxLength={6}
                  value={pairingCodeInput}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setPairingCodeInput(digits);
                    if (pairingError) setPairingError(null);
                  }}
                  placeholder="000000"
                  className="w-full rounded-2xl border-2 border-slate-700 bg-slate-950 px-4 py-4 text-center font-mono text-3xl sm:text-4xl font-black tracking-[0.35em] text-white placeholder:text-slate-700 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {pairingError && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
                  <XCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{pairingError}</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                <button
                  type="submit"
                  disabled={
                    isPairingSubmitting || pairingCodeInput.trim().length !== 6
                  }
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg hover:bg-emerald-500 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {isPairingSubmitting
                    ? 'Párosítás folyamatban...'
                    : 'Kijelző Párosítása és Indítása'}
                </button>

                {pairingCodeInput.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setPairingCodeInput('');
                      setPairingError(null);
                    }}
                    className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white"
                  >
                    Törlés
                  </button>
                )}
              </div>
            </form>

            <div className="mt-6 border-t border-slate-800 pt-4 text-[11px] text-slate-400 space-y-1.5">
              <p>
                • <strong className="text-slate-200">Ugyanazon a PC-n használod?</strong>{' '}
                Ha bejelentkezel a recepciós felületre ebben a böngészőben, a
                Vendégmonitor kód megadása nélkül azonnal működik.
              </p>
              <p>
                • <strong className="text-slate-200">Biztonságos párosítás:</strong>{' '}
                A generált 6 jegyű kód 10 percig érvényes, és a recepcióról bármikor
                megszakítható.
              </p>
            </div>
          </div>
        </main>

        <footer className="text-center text-xs text-slate-500">
          ReformStudioSync • Valós Idejű Ügyfélkijelző Modul
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 sm:p-8 flex flex-col justify-between">
      {!isFullscreen && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {isStaffAuthenticated && (
              <Link
                to="/reception"
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 border border-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Recepció
              </Link>
            )}
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Monitor className="h-4 w-4 text-emerald-400" />
              <span>
                Üzemmód:{' '}
                <strong className="text-slate-200">
                  {isStaffAuthenticated
                    ? `Recepciós PC Másodlagos Kijelző (${user?.name ?? 'Bejelentkezve'})`
                    : `Párosított Önálló Kijelző (${deviceName ?? 'Tablet'})`}
                </strong>
              </span>
              <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-300 border border-emerald-500/30">
                V0.2
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                isScannerListening
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
              title="A kijelző folyamatosan figyeli a csatlakoztatott QR / vonalkód olvasót"
            >
              <QrCode className="h-3.5 w-3.5" />
              {isScannerListening
                ? `QR Szkenner Csatorna Aktív${lastScannedCode ? ` (#${lastScannedCode})` : ''}`
                : 'QR Szkenner Szünetel'}
            </span>

            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                isConnected
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
              }`}
            >
              <Wifi className="h-3.5 w-3.5" />
              {isConnected
                ? 'Élő Socket + Helyi Szinkron Aktív'
                : 'Helyi Broadcast Szinkron Aktív'}
            </span>

            {wakeLockActive && (
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-slate-900 border border-slate-800 px-2.5 py-1 text-[11px] text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                WakeLock Aktív
              </span>
            )}

            {isDevicePaired && (
              <>
                {!confirmUnpair ? (
                  <button
                    type="button"
                    onClick={() => setConfirmUnpair(true)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Párosítás megszakítása
                  </button>
                ) : (
                  <div className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/50 bg-slate-900 px-2.5 py-1 text-xs">
                    <span className="text-rose-300 font-semibold">
                      Leválasztod?
                    </span>
                    <button
                      type="button"
                      onClick={handleUnpairDevice}
                      className="rounded-lg bg-rose-600 px-2 py-0.5 font-bold text-white hover:bg-rose-500"
                    >
                      Igen, bontás
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmUnpair(false)}
                      className="rounded-lg bg-slate-800 px-2 py-0.5 text-slate-300 hover:text-white"
                    >
                      Mégse
                    </button>
                  </div>
                )}
              </>
            )}

            <button
              type="button"
              onClick={toggleFullscreen}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              Teljes Képernyő
            </button>
          </div>
        </header>
      )}

      {testPingBanner && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-emerald-400/50 bg-emerald-500/20 px-5 py-3.5 text-white shadow-lg">
          <div className="flex items-center gap-3">
            <Radio className="h-6 w-6 text-emerald-300 animate-pulse" />
            <div>
              <p className="text-sm font-extrabold text-emerald-200">
                TESZT JEL SIKERESEN FOGADVA!
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
