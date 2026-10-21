import {
  CheckInResultPayload,
  CheckInRevokedPayload,
} from '@reform/shared';
import {
  Maximize2,
  Monitor,
  QrCode,
  ShieldCheck,
  Smartphone,
  Wifi,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMonitorChannel } from '../../hooks/useMonitorChannel';
import { api } from '../../lib/api';
import { mockStudioEngine } from '../../lib/mock-engine';
import { notify } from '../../lib/notify';
import { soundFeedback } from '../../lib/sound';
import { useAuthStore } from '../../stores/authStore';
import { useScannerChannelStore } from '../../stores/scannerChannelStore';
import { MonitorDisplayCard } from './MonitorDisplayCard';

export const MonitorPage: React.FC = () => {
  const { accessToken, deviceToken, deviceName, setDeviceAuth } = useAuthStore();
  const { isListening: isScannerListening, lastScannedCode } =
    useScannerChannelStore();
  const [activeResult, setActiveResult] = useState<CheckInResultPayload | null>(
    null,
  );
  const [revokedBanner, setRevokedBanner] =
    useState<CheckInRevokedPayload | null>(null);
  const [showPairingBox, setShowPairingBox] = useState<boolean>(false);
  const [pairingCodeInput, setPairingCodeInput] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(
    Boolean(typeof document !== 'undefined' && document.fullscreenElement),
  );
  const resetTimerRef = useRef<number | null>(null);

  const handleCheckInResult = useCallback((payload: CheckInResultPayload) => {
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    setRevokedBanner(null);
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
    setRevokedBanner(payload);
    soundFeedback.playWarning();

    resetTimerRef.current = window.setTimeout(() => {
      setRevokedBanner(null);
    }, 6000);
  }, []);

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
    enableWakeLock: true,
  });

  const handlePairSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pairingCodeInput.trim()) return;
    try {
      const res = await api.verifyDisplayPairing(pairingCodeInput.trim());
      setDeviceAuth(res.deviceToken, res.device.name);
      setShowPairingBox(false);
      setPairingCodeInput('');
      notify.success(
        'Kijelző sikeresen párosítva!',
        `Eszköz neve: ${res.device.name}`,
      );
    } catch (err) {
      notify.error('Párosítás sikertelen', (err as Error).message);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement && !isFullscreen) {
      setIsFullscreen(true);
      setShowPairingBox(false);
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

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 sm:p-8 flex flex-col justify-between">
      {!isFullscreen && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Monitor className="h-4 w-4 text-emerald-400" />
              <span>
                Üzemmód:{' '}
                <strong className="text-slate-200">
                  {deviceToken
                    ? `Párosított Tablet (${deviceName})`
                    : accessToken
                      ? 'Recepciós PC Másodlagos Kijelző'
                      : 'Helyi / Dual-Screen Szinkron'}
                </strong>
              </span>
              <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-300 border border-emerald-500/30">
                V0.1
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
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
                ? 'Socket + Helyi Szinkron Aktív'
                : 'Helyi Broadcast Szinkron Aktív'}
            </span>

            {wakeLockActive && (
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-slate-900 border border-slate-800 px-2.5 py-1 text-[11px] text-slate-400">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                WakeLock Aktív
              </span>
            )}

            <button
              type="button"
              onClick={() => setShowPairingBox((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
            >
              <Smartphone className="h-3.5 w-3.5 text-emerald-400" />
              Tablet Párosító Kód
            </button>

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

      {!isFullscreen && showPairingBox && (
        <form
          onSubmit={handlePairSubmit}
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-slate-900/90 p-4"
        >
          <div>
            <h4 className="text-sm font-semibold text-white">
              Önálló Tablet / Ügyfélkijelző Párosítása
            </h4>
            <p className="text-xs text-slate-400">
              Írd be a Recepciós Pult "Kijelző Párosítás" menüjében generált 6 jegyű kódot:
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              maxLength={6}
              value={pairingCodeInput}
              onChange={(e) => setPairingCodeInput(e.target.value)}
              placeholder="Pl. 482910"
              className="w-36 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-center font-mono text-base font-bold tracking-widest text-white focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              Párosítás
            </button>
          </div>
        </form>
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
