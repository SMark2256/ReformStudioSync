import {
  CheckInResultPayload,
  CheckInRevokedPayload,
  CheckInStatus,
  GuestDto,
  PassType,
  PaymentMethod,
} from '@reform/shared';
import {
  AlertTriangle,
  ArrowLeft,
  Barcode,
  BellRing,
  CalendarPlus,
  CheckCircle2,
  CloudOff,
  ExternalLink,
  FlaskConical,
  Monitor,
  QrCode,
  RefreshCw,
  RotateCcw,
  Snowflake,
  Sparkles,
  Sun,
  UserPlus,
  Wallet,
  XCircle,
} from 'lucide-react';
import React, { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { mockStudioEngine } from '../../lib/mock-engine';
import { notify } from '../../lib/notify';
import { useOfflineQueueStore } from '../../stores/offlineQueueStore';
import { DigitalPassCardModal } from '../guests/DigitalPassCardModal';
import { GuestModal } from '../guests/GuestModal';
import { MonitorDisplayCard } from '../monitor/MonitorDisplayCard';
import { SellPassModal } from '../reception/SellPassModal';

export const DemoSandboxPage: React.FC = () => {
  const [, setTick] = useState(0);
  const forceRender = useCallback(() => setTick((t) => t + 1), []);

  const [monitorResult, setMonitorResult] =
    useState<CheckInResultPayload | null>(null);
  const [revokedBanner, setRevokedBanner] =
    useState<CheckInRevokedPayload | null>(null);
  const monitorTimerRef = useRef<number | null>(null);

  const [sellModalState, setSellModalState] = useState<{
    isOpen: boolean;
    guest: GuestDto | null;
    preselectedTemplateId?: string | null;
  }>({ isOpen: false, guest: null });

  const [guestModalState, setGuestModalState] = useState<{
    isOpen: boolean;
    guest: GuestDto | null;
  }>({ isOpen: false, guest: null });

  const [digitalCardGuest, setDigitalCardGuest] = useState<GuestDto | null>(
    null,
  );

  const {
    queue: offlineQueue,
    isOnline,
    setOnline,
    enqueueScan,
    clearQueue,
  } = useOfflineQueueStore();

  const guests = mockStudioEngine.getGuests();
  const templates = mockStudioEngine.getTemplates(true);
  const todayCheckIns = mockStudioEngine.getTodayCheckIns();
  const financeSummary = mockStudioEngine.getDailyFinanceSummary();

  const showOnEmbeddedMonitor = useCallback((payload: CheckInResultPayload) => {
    if (monitorTimerRef.current) window.clearTimeout(monitorTimerRef.current);
    setRevokedBanner(null);
    setMonitorResult(payload);
    monitorTimerRef.current = window.setTimeout(() => {
      setMonitorResult(null);
    }, 7000);
  }, []);

  const showRevokedOnEmbeddedMonitor = useCallback(
    (payload: CheckInRevokedPayload) => {
      if (monitorTimerRef.current) window.clearTimeout(monitorTimerRef.current);
      setMonitorResult(null);
      setRevokedBanner(payload);
      monitorTimerRef.current = window.setTimeout(() => {
        setRevokedBanner(null);
      }, 6000);
    },
    [],
  );

  const handleRevokeCheckIn = useCallback(
    (checkInId: string) => {
      try {
        const revoked = mockStudioEngine.revokeCheckIn(checkInId);
        showRevokedOnEmbeddedMonitor(revoked);
        notify.success(
          `Beléptetés sztornózva: ${revoked.guestName}`,
          `Alkalom visszaírva (+1). Aktuális egyenleg: ${revoked.restoredRemainingPasses}`,
        );
        forceRender();
      } catch (err) {
        notify.error('Sztornó hiba', (err as Error).message);
      }
    },
    [showRevokedOnEmbeddedMonitor, forceRender],
  );

  const handleSimulatedScan = useCallback(
    (barcode: string, forceDuplicate = false) => {
      if (!isOnline) {
        const item = enqueueScan(barcode);
        notify.warning(
          `Offline Pufferbe mentve: #${item.barcode}`,
          'Kapcsolat helyreállításakor ("Online mód") automatikusan vagy gombnyomásra szinkronizálódik.',
        );
        return;
      }

      try {
        const result = mockStudioEngine.scanCheckIn({
          barcode,
          forceDuplicate,
        });
        showOnEmbeddedMonitor(result);
        notify.checkInResult(result, {
          onRevoke: (chkId) => handleRevokeCheckIn(chkId),
          onForceDuplicate: (code) => handleSimulatedScan(code, true),
          onOpenSellModal: (guestId, suggestedTplId) => {
            const g = mockStudioEngine
              .getGuests()
              .find((x) => x.id === guestId);
            if (g) {
              setSellModalState({
                isOpen: true,
                guest: g,
                preselectedTemplateId: suggestedTplId,
              });
            }
          },
        });
        forceRender();
      } catch (err) {
        notify.error('Beléptetési hiba', (err as Error).message);
      }
    },
    [
      isOnline,
      enqueueScan,
      showOnEmbeddedMonitor,
      handleRevokeCheckIn,
      forceRender,
    ],
  );

  useBarcodeScanner({
    onScan: (code) => handleSimulatedScan(code),
    enabled: true,
  });

  const handleResetDemo = () => {
    mockStudioEngine.resetDatabase();
    clearQueue();
    setMonitorResult(null);
    setRevokedBanner(null);
    notify.success(
      'Demo adatbázis alaphelyzetbe állítva!',
      'Minden tesztvendég, bérlet és pénzügyi tranzakció visszaállt a kiinduló állapotba.',
    );
    forceRender();
  };

  const handleSyncOffline = () => {
    if (offlineQueue.length === 0) return;
    const res = mockStudioEngine.syncOfflineScans(offlineQueue);
    clearQueue();
    setOnline(true);
    if (res.results.length > 0) {
      showOnEmbeddedMonitor(res.results[res.results.length - 1]);
    }
    notify.success(
      `Offline várólista feldolgozva (${res.processed} db beléptetés)!`,
      'Az összes offline beolvasott vonalkód szinkronizálva lett.',
    );
    forceRender();
  };

  return (
    <div className="min-h-screen bg-slate-100 pb-12">
      {/* Top Demo Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950 text-white shadow-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-500/40">
              <FlaskConical className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold">
                  ReformStudioSync — Interaktív Demo & Tesztkörnyezet (/demo)
                </h1>
                <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase text-emerald-300 border border-emerald-500/30">
                  Mock Sandbox
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Minden funkció, vonalkód-szimuláció, Toast értesítés, sztornó és Vendégmonitor valós időben kipróbálható.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/reception"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Recepciós Felület (/reception)
            </Link>

            <button
              type="button"
              onClick={() =>
                window.open(
                  '/monitor',
                  'ReformStudioGuestMonitor',
                  'width=1280,height=800',
                )
              }
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-slate-800"
            >
              <Monitor className="h-3.5 w-3.5" />
              Külön Monitor Ablak
              <ExternalLink className="h-3 w-3" />
            </button>

            <button
              type="button"
              onClick={handleResetDemo}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-1.5 text-xs font-extrabold text-slate-950 hover:bg-amber-400"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Demo Adatok Visszaállítása (Reset)
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 space-y-6">
        {/* Split-Screen Row: Virtual Scanner Simulator (Left) + Live Embedded Guest Monitor (Right) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: Virtual Barcode Scanner Simulator */}
          <div className="lg:col-span-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between space-y-5">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Barcode className="h-5 w-5 text-emerald-600" />
                  <h2 className="text-base font-extrabold text-slate-900">
                    1. Virtuális Vonalkódolvasó Szimulátor
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !isOnline;
                    setOnline(next);
                    if (!next) {
                      notify.warning(
                        'Offline szimuláció bekapcsolva!',
                        'A következő vonalkód-beolvasások az Offline Pufferbe kerülnek.',
                      );
                    } else {
                      notify.info('Online mód visszaállítva');
                    }
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-bold border ${
                    isOnline
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-amber-300 bg-amber-100 text-amber-900'
                  }`}
                >
                  <CloudOff className="h-3.5 w-3.5" />
                  {isOnline
                    ? 'Hálózat: Online (Kattints Offline teszthez)'
                    : `OFFLINE MÓD (${offlineQueue.length} várakozik)`}
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Kattints bármelyik tesztkártyára a fizikai vonalkódolvasó szimulálásához. Figyeld a jobb oldali Vendégmonitort és a felugró interaktív Toast visszaigazolásokat!
              </p>

              <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => handleSimulatedScan('100001')}
                  className="flex flex-col items-start rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5 text-left hover:bg-emerald-100/70 transition"
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="font-bold text-sm text-slate-900">
                      Kovács Anna
                    </span>
                    <span className="rounded bg-emerald-600 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                      #100001
                    </span>
                  </div>
                  <span className="mt-1 text-xs text-emerald-800 font-medium">
                    Sikeres beléptetés (10 alk. bérlet)
                  </span>
                  <span className="mt-0.5 text-[11px] text-slate-500">
                    Teszteli: Alkalomlevonás + Sztornó Toast
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSimulatedScan('100002')}
                  className="flex flex-col items-start rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5 text-left hover:bg-amber-100/70 transition"
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="font-bold text-sm text-slate-900">
                      Nagy Péter
                    </span>
                    <span className="rounded bg-amber-600 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                      #100002
                    </span>
                  </div>
                  <span className="mt-1 text-xs text-amber-900 font-medium">
                    Utolsó alkalom (1 maradt) + 2 nap lejárat
                  </span>
                  <span className="mt-0.5 text-[11px] text-slate-500">
                    Teszteli: Utolsó alkalom + 1-kattintásos megújítás
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSimulatedScan('100003')}
                  className="flex flex-col items-start rounded-2xl border border-teal-200 bg-teal-50/60 p-3.5 text-left hover:bg-teal-100/70 transition"
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="font-bold text-sm text-slate-900">
                      Szabó Eszter
                    </span>
                    <span className="rounded bg-teal-600 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                      #100003
                    </span>
                  </div>
                  <span className="mt-1 text-xs text-teal-900 font-medium">
                    Havi Korlátlan (TIME_BASED) bérlet
                  </span>
                  <span className="mt-0.5 text-[11px] text-slate-500">
                    Teszteli: Korlátlan belépés prioritás
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSimulatedScan('100004')}
                  className="flex flex-col items-start rounded-2xl border border-rose-200 bg-rose-50/70 p-3.5 text-left hover:bg-rose-100/70 transition"
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="font-bold text-sm text-slate-900">
                      Tóth Gábor
                    </span>
                    <span className="rounded bg-rose-600 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                      #100004
                    </span>
                  </div>
                  <span className="mt-1 text-xs text-rose-800 font-medium">
                    Lejárt bérlet (Elutasítva)
                  </span>
                  <span className="mt-0.5 text-[11px] text-slate-500">
                    Teszteli: DENIED + 1-kattintásos bérleteladás
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSimulatedScan('100006')}
                  className="flex flex-col items-start rounded-2xl border border-sky-200 bg-sky-50/70 p-3.5 text-left hover:bg-sky-100/70 transition"
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="font-bold text-sm text-slate-900">
                      Horváth Dóra
                    </span>
                    <span className="rounded bg-sky-600 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                      #100006
                    </span>
                  </div>
                  <span className="mt-1 text-xs text-sky-900 font-medium">
                    Fagyasztott bérlet (Szünetel)
                  </span>
                  <span className="mt-0.5 text-[11px] text-slate-500">
                    Teszteli: Fagyasztás ellenőrzés és feloldás
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSimulatedScan('999999')}
                  className="flex flex-col items-start rounded-2xl border border-slate-200 bg-slate-50 p-3.5 text-left hover:bg-slate-100 transition"
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="font-bold text-sm text-slate-900">
                      Ismeretlen Kártya
                    </span>
                    <span className="rounded bg-slate-700 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                      #999999
                    </span>
                  </div>
                  <span className="mt-1 text-xs text-slate-700 font-medium">
                    Nem regisztrált vonalkód
                  </span>
                  <span className="mt-0.5 text-[11px] text-slate-500">
                    Teszteli: Hiba Toast + Hangjelzés
                  </span>
                </button>
              </div>
            </div>

            {/* Offline Queue & Toast Test Controls */}
            <div className="border-t border-slate-100 pt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {offlineQueue.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSyncOffline}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-extrabold text-slate-950 hover:bg-amber-400"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Offline Puffer Szinkronizálása ({offlineQueue.length} db)
                  </button>
                )}

                <button
                  type="button"
                  onClick={() =>
                    notify.success(
                      'Minta Sikeres Művelet Toast',
                      'Minden recepciós művelet azonnali visszaigazolást ad.',
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <BellRing className="h-3.5 w-3.5 text-emerald-600" />
                  Sikeres Toast Teszt
                </button>

                <button
                  type="button"
                  onClick={() =>
                    notify.error(
                      'Minta Hiba Toast',
                      'Strukturált hibaüzenet és figyelmeztető hangjelzés.',
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <BellRing className="h-3.5 w-3.5 text-rose-600" />
                  Hiba Toast Teszt
                </button>
              </div>
            </div>
          </div>

          {/* Right: Live Embedded Guest Monitor Preview */}
          <div className="lg:col-span-6 flex flex-col">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                2. Élő Beágyazott Vendégmonitor Előnézet (Másodlagos Kijelző / Tablet)
              </span>
              <span className="text-xs text-emerald-700 font-semibold">
                Valós idejű szinkron (&lt;1 ms)
              </span>
            </div>
            <MonitorDisplayCard
              activeResult={monitorResult}
              revokedBanner={revokedBanner}
              compact={true}
            />
          </div>
        </div>

        {/* Interactive Guests, Digital Cards, Pass Extend/Freeze & Sztornó Section */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Guest Cards with 1-Click Actions */}
          <div className="lg:col-span-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  3. Vendégek, Digitális Kártyák (QR/Code-128), Bérlet Hosszabbítás & Fagyasztás
                </h3>
                <p className="text-xs text-slate-500">
                  Próbáld ki a bérletértékesítést, a +14 napos hosszabbítást, a fagyasztás feloldását és a digitális PNG kártyát!
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setGuestModalState({ isOpen: true, guest: null })
                }
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800"
              >
                <UserPlus className="h-3.5 w-3.5" />
                + Új Tesztvendég
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {guests.map((g) => {
                const pass = (g.passes ?? [])[0];
                const isExpired =
                  pass && new Date(pass.expirationDate).getTime() < Date.now();

                return (
                  <div
                    key={g.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3.5"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">
                          {g.lastName} {g.firstName}
                        </span>
                        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                          #{g.barcode}
                        </span>
                        {pass?.isFrozen && (
                          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-800">
                            FAGYASZTVA
                          </span>
                        )}
                        {isExpired && (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                            LEJÁRT
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {pass
                          ? `${pass.passTemplateName} • Egyenleg: ${
                              pass.type === PassType.TIME_BASED
                                ? 'Korlátlan'
                                : `${pass.remainingPasses} / ${pass.totalPasses} alk.`
                            } • Lejár: ${new Date(pass.expirationDate).toLocaleDateString('hu-HU')}`
                          : 'Nincs bérlet'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleSimulatedScan(g.barcode)}
                        className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
                      >
                        Beléptetés
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setSellModalState({
                            isOpen: true,
                            guest: g,
                            preselectedTemplateId: pass?.passTemplateId,
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Bérlet Eladás / Megújítás
                      </button>

                      {pass && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = mockStudioEngine.extendPass(
                                pass.id,
                                14,
                                'Demo teszt hosszabbítás',
                              );
                              notify.success(
                                `Bérlet meghosszabbítva (+14 nap): ${g.lastName} ${g.firstName}`,
                                `Új lejárat: ${new Date(updated.expirationDate).toLocaleDateString('hu-HU')}`,
                              );
                              forceRender();
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <CalendarPlus className="h-3.5 w-3.5" />
                            +14 nap
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const updated = mockStudioEngine.toggleFreezePass(
                                pass.id,
                                'Demo fagyasztás teszt',
                              );
                              notify.success(
                                updated.isFrozen
                                  ? `Bérlet fagyasztva: ${g.lastName} ${g.firstName}`
                                  : `Fagyasztás feloldva: ${g.lastName} ${g.firstName}`,
                                `Érvényesség: ${new Date(updated.expirationDate).toLocaleDateString('hu-HU')}`,
                              );
                              forceRender();
                            }}
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                              pass.isFrozen
                                ? 'bg-amber-500 text-white hover:bg-amber-600'
                                : 'bg-sky-600 text-white hover:bg-sky-500'
                            }`}
                          >
                            {pass.isFrozen ? (
                              <>
                                <Sun className="h-3.5 w-3.5" />
                                Feloldás
                              </>
                            ) : (
                              <>
                                <Snowflake className="h-3.5 w-3.5" />
                                Fagyasztás
                              </>
                            )}
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => setDigitalCardGuest(g)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        title="Digitális Belépőkártya Generátor"
                      >
                        <QrCode className="h-3.5 w-3.5 text-emerald-600" />
                        Kártya
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Check-In Sztornó & Daily Cash Register Summary */}
          <div className="lg:col-span-4 space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-slate-900 p-6 text-white shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  4. Napi Kassza & Fizetés Sztornó
                </span>
                <Wallet className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="mt-2 text-3xl font-black">
                {financeSummary.totalRevenue.toLocaleString('hu-HU')} Ft
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-xl bg-slate-800 p-2">
                  <span className="text-slate-400 block">Készpénz</span>
                  <strong>
                    {financeSummary.byMethod.CASH.toLocaleString('hu-HU')} Ft
                  </strong>
                </div>
                <div className="rounded-xl bg-slate-800 p-2">
                  <span className="text-slate-400 block">Kártya</span>
                  <strong>
                    {financeSummary.byMethod.POS_CARD.toLocaleString('hu-HU')}{' '}
                    Ft
                  </strong>
                </div>
                <div className="rounded-xl bg-slate-800 p-2">
                  <span className="text-slate-400 block">Átutalás</span>
                  <strong>
                    {financeSummary.byMethod.BANK_TRANSFER.toLocaleString(
                      'hu-HU',
                    )}{' '}
                    Ft
                  </strong>
                </div>
              </div>

              <div className="mt-4 border-t border-slate-800 pt-3 space-y-2 max-h-44 overflow-y-auto">
                {financeSummary.payments.map((pay) => (
                  <div
                    key={pay.id}
                    className={`flex items-center justify-between text-xs ${
                      pay.isCancelled ? 'line-through text-slate-500' : ''
                    }`}
                  >
                    <div>
                      <span className="font-bold">{pay.guestName}</span>
                      <span className="block text-[11px] text-slate-400">
                        {pay.amount.toLocaleString('hu-HU')} Ft (
                        {pay.paymentMethod === PaymentMethod.CASH
                          ? 'Készpénz'
                          : pay.paymentMethod === PaymentMethod.POS_CARD
                            ? 'Kártya'
                            : 'Átutalás'}
                        )
                      </span>
                    </div>
                    {!pay.isCancelled ? (
                      <button
                        type="button"
                        onClick={() => {
                          mockStudioEngine.cancelPayment(
                            pay.id,
                            'Demo kassza sztornó',
                          );
                          notify.warning(
                            `Fizetés sztornózva: ${pay.guestName}`,
                            `${pay.amount.toLocaleString('hu-HU')} Ft levonva és a bérlet deaktiválva.`,
                          );
                          forceRender();
                        }}
                        className="rounded-lg bg-rose-500/20 border border-rose-500/40 px-2 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/30"
                      >
                        Sztornó
                      </button>
                    ) : (
                      <span className="text-[10px] font-bold text-rose-400">
                        SZTORNÓZVA
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-sm font-extrabold text-slate-900 mb-3">
                5. Beléptetési Napló & 1-Kattintásos Sztornó
              </h3>
              <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                {todayCheckIns.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between py-2.5 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      {log.status === CheckInStatus.SUCCESS ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      ) : log.status === CheckInStatus.CANCELLED ? (
                        <RotateCcw className="h-4 w-4 text-amber-600 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
                      )}
                      <div>
                        <span className="font-bold text-slate-900">
                          {log.guestName}
                        </span>
                        <span className="block text-[11px] text-slate-500">
                          {log.status === CheckInStatus.CANCELLED
                            ? 'Sztornózva (+1 visszaírva)'
                            : log.passName ?? log.reason}
                        </span>
                      </div>
                    </div>

                    {log.status === CheckInStatus.SUCCESS && (
                      <button
                        type="button"
                        onClick={() => handleRevokeCheckIn(log.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 font-bold text-amber-800 hover:bg-amber-100"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Sztornó
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
      <SellPassModal
        isOpen={sellModalState.isOpen}
        guest={sellModalState.guest}
        templates={templates}
        preselectedTemplateId={sellModalState.preselectedTemplateId}
        onClose={() => setSellModalState({ isOpen: false, guest: null })}
        onConfirmSell={(data) => {
          const sold = mockStudioEngine.sellPass(data);
          notify.success(
            `Bérlet eladva: ${sold.pass.passTemplateName}`,
            `Összeg: ${sold.amount.toLocaleString('hu-HU')} Ft rögzítve a kasszába.`,
          );
          setSellModalState({ isOpen: false, guest: null });
          forceRender();
        }}
      />

      <GuestModal
        isOpen={guestModalState.isOpen}
        guest={guestModalState.guest}
        onClose={() => setGuestModalState({ isOpen: false, guest: null })}
        onSaveGuest={(data) => {
          try {
            const saved = data.id
              ? mockStudioEngine.updateGuest(data.id, data)
              : mockStudioEngine.createGuest(data);
            notify.success(
              data.id ? 'Vendég frissítve!' : 'Új tesztvendég létrehozva!',
              `${saved.lastName} ${saved.firstName} (#${saved.barcode})`,
            );
            setGuestModalState({ isOpen: false, guest: null });
            forceRender();
          } catch (err) {
            notify.error('Mentési hiba', (err as Error).message);
          }
        }}
      />

      <DigitalPassCardModal
        guest={digitalCardGuest}
        onClose={() => setDigitalCardGuest(null)}
      />
    </div>
  );
};
