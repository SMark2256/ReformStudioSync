import {
  CheckInResultPayload,
  CheckInRevokedPayload,
  CheckInStatus,
  DUPLICATE_SCAN_COOLDOWN_SECONDS,
  GuestDto,
  PassType,
  PaymentMethod,
  VisitType,
} from '@reform/shared';
import {
  Barcode,
  BellRing,
  CalendarPlus,
  CheckCircle2,
  CloudOff,
  ExternalLink,
  FileSignature,
  FlaskConical,
  Monitor,
  QrCode,
  RefreshCw,
  RotateCcw,
  Snowflake,
  Sparkles,
  Sun,
  Ticket,
  UserPlus,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ThemeToggleButton } from '../../components/ThemeToggleButton';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { mockStudioEngine } from '../../lib/mock-engine';
import { notify } from '../../lib/notify';
import { useOfflineQueueStore } from '../../stores/offlineQueueStore';
import { useThemeStore } from '../../stores/themeStore';
import { DigitalPassCardModal } from '../guests/DigitalPassCardModal';
import { GuestModal } from '../guests/GuestModal';
import { MonitorDisplayCard } from '../monitor/MonitorDisplayCard';
import { DeductTreatmentModal } from '../reception/DeductTreatmentModal';
import { RecordPaymentModal } from '../reception/RecordPaymentModal';
import { SellPassModal } from '../reception/SellPassModal';

export const DemoSandboxPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme } = useThemeStore();
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

  const [deductModalState, setDeductModalState] = useState<{
    isOpen: boolean;
    guest: GuestDto | null;
  }>({ isOpen: false, guest: null });

  const [paymentModalState, setPaymentModalState] = useState<{
    isOpen: boolean;
    guest: GuestDto | null;
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
  const services = mockStudioEngine.getServices(true);
  const templates = mockStudioEngine.getTemplates(true);
  const todayCheckIns = mockStudioEngine.getTodayCheckIns();
  const financeSummary = mockStudioEngine.getDailyFinanceSummary();

  const activeModalGuest = guestModalState.guest
    ? guests.find((g) => g.id === guestModalState.guest?.id) ??
      guestModalState.guest
    : null;

  const showOnEmbeddedMonitor = useCallback((payload: CheckInResultPayload) => {
    if (monitorTimerRef.current) window.clearTimeout(monitorTimerRef.current);
    setRevokedBanner(null);
    setMonitorResult(payload);
    const seconds =
      payload.greetingSeconds ?? mockStudioEngine.getMonitorGreetingSeconds();
    monitorTimerRef.current = window.setTimeout(() => {
      setMonitorResult(null);
    }, seconds * 1000);
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
          `Beléptetés / Levonás sztornózva: ${revoked.guestName}`,
          `Aktuális egyenleg: ${revoked.restoredRemainingPasses}`,
        );
        forceRender();
      } catch (err) {
        notify.error('Sztornó hiba', (err as Error).message);
      }
    },
    [showRevokedOnEmbeddedMonitor, forceRender],
  );

  const handleSimulatedScan = useCallback(
    (
      barcode: string,
      forceDuplicate = false,
      visitType: VisitType = VisitType.CIRCUIT_TRAINING,
      serviceId?: string,
    ) => {
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
          visitType,
          serviceId,
        });
        showOnEmbeddedMonitor(result);
        notify.checkInResult(result, {
          onRevoke: (chkId) => handleRevokeCheckIn(chkId),
          onForceDuplicate: (code) =>
            handleSimulatedScan(code, true, visitType, serviceId),
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
      'Minden tesztvendég, tagság, bérlet, fotó és pénzügyi tranzakció visszaállt a kiinduló állapotba.',
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

  const openGuestSheet = (guest: GuestDto | null) => {
    setGuestModalState({ isOpen: true, guest });
    navigate(location.pathname, {
      state: {
        guestSheetOpen: true,
        guestId: guest?.id ?? '__NEW__',
        guestSnapshot: guest,
        guestSubTab: 'overview',
      },
    });
  };

  const closeGuestSheet = () => {
    setGuestModalState({ isOpen: false, guest: null });
    navigate(location.pathname, {
      state: {
        guestSheetOpen: false,
        guestId: null,
        guestSnapshot: null,
        guestSubTab: 'overview',
      },
    });
  };

  useEffect(() => {
    const st =
      (location.state as {
        guestSheetOpen?: boolean;
        guestId?: string | null;
        guestSnapshot?: GuestDto | null;
      } | null) ?? null;

    if (st?.guestSheetOpen) {
      const matched =
        st.guestId && st.guestId !== '__NEW__'
          ? (guests.find((g) => g.id === st.guestId) ??
              st.guestSnapshot ??
              null)
          : null;
      setGuestModalState({ isOpen: true, guest: matched });
    } else {
      setGuestModalState({ isOpen: false, guest: null });
    }
  }, [location.key, location.state]);

  return (
    <div
      className={`min-h-screen bg-slate-50 dark:bg-slate-950 pb-12 transition-colors duration-200 ${
        theme === 'dark' ? 'reception-theme-dark dark' : ''
      }`}
    >
      {/* Top Demo Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30">
              <FlaskConical className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold text-slate-900 dark:text-white">
                  RE-FORM Stúdió — Interaktív Demo & Tesztkörnyezet
                </h1>
                <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                  V0.1
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Köredzés (0 levonás) vs. Alkalmas Kezelés (Hypoxi -1), 10 mp dupla védelem, Vendégkartoték és adatvédett Vendégmonitor.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ThemeToggleButton />

            <Link
              to="/tablet"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-amber-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              <FileSignature className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
              Tablet Aláíró (/tablet)
            </Link>

            <Link
              to="/reception"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
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
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-slate-200 dark:hover:bg-slate-700"
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
        {guestModalState.isOpen ? (
          <GuestModal
            isOpen={guestModalState.isOpen}
            guest={activeModalGuest}
            services={services}
            backLabel="Vissza a vendégkartotékra"
            onClose={closeGuestSheet}
            onSaveGuest={(data) => {
              try {
                const saved = data.id
                  ? mockStudioEngine.updateGuest(data.id, data)
                  : mockStudioEngine.createGuest(data);
                notify.success(
                  data.id ? 'Vendég frissítve!' : 'Új tesztvendég létrehozva!',
                  `${saved.lastName} ${saved.firstName} (#${saved.barcode})`,
                );
                if (!data.id) {
                  closeGuestSheet();
                }
                forceRender();
              } catch (err) {
                notify.error('Mentési hiba', (err as Error).message);
              }
            }}
            onExtendPass={(passId, additionalDays, note) => {
              mockStudioEngine.extendPass(passId, additionalDays, note);
              notify.success(`Bérlet meghosszabbítva (+${additionalDays} nap)!`);
              forceRender();
            }}
            onToggleFreezePass={(passId, note) => {
              mockStudioEngine.toggleFreezePass(passId, note);
              notify.success('Bérlet fagyasztási státusza frissítve!');
              forceRender();
            }}
            onOpenDigitalCard={(g) => setDigitalCardGuest(g)}
            onRefreshAll={forceRender}
          />
        ) : (
          <>
        {/* Split-Screen Row: Virtual Scanner Simulator (Left) + Live Embedded Guest Monitor (Right) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: Virtual Barcode Scanner Simulator */}
          <div className="lg:col-span-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm flex flex-col justify-between space-y-5">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Barcode className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                    1. Köredzés (2.3) vs. Kezelés Levonás (2.4) Szimulátor
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
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-bold border transition-colors ${
                    isOnline
                      ? 'border-emerald-200 dark:border-emerald-500/35 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                      : 'border-amber-300 dark:border-amber-500/40 bg-amber-100 dark:bg-amber-500/20 text-amber-900 dark:text-amber-300'
                  }`}
                >
                  <CloudOff className="h-3.5 w-3.5" />
                  {isOnline
                    ? 'Hálózat: Online'
                    : `OFFLINE MÓD (${offlineQueue.length} várakozik)`}
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Próbáld ki a különbséget a Köredzéses érkezés (0 levonás, diszkrét üdvözlés) és az Alkalmas kezelés (Hypoxi -1 alkalom, hátralévő egyenleg) között! Dupla leolvasás védelem: {DUPLICATE_SCAN_COOLDOWN_SECONDS} mp.
              </p>

              <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() =>
                    handleSimulatedScan(
                      '100001',
                      false,
                      VisitType.CIRCUIT_TRAINING,
                    )
                  }
                  className="flex flex-col items-start rounded-2xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/10 p-3.5 text-left hover:bg-emerald-100/70 dark:hover:bg-emerald-500/20 transition"
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      Kovács Anna (Köredzés)
                    </span>
                    <span className="rounded bg-emerald-600 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                      #100001
                    </span>
                  </div>
                  <span className="mt-1 text-xs text-emerald-800 dark:text-emerald-300 font-bold">
                    2.3 Köredzés Érkezés (0 levonás!)
                  </span>
                  <span className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    Monitor: „Üdvözlünk, Kovács Anna! Jó edzést kívánunk!”
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const anna = guests.find((g) => g.barcode === '100001');
                    const hypoxiPass = anna?.passes?.find((p) => p.isActive);
                    if (anna && hypoxiPass) {
                      const res = mockStudioEngine.deductPassUsage({
                        guestId: anna.id,
                        passId: hypoxiPass.id,
                        serviceId: 'srv-hypoxi',
                        operationKey: `demo-hypoxi-${Date.now()}`,
                      });
                      showOnEmbeddedMonitor(res);
                      notify.checkInResult(res, {
                        onRevoke: (chkId) => handleRevokeCheckIn(chkId),
                      });
                      forceRender();
                    }
                  }}
                  className="flex flex-col items-start rounded-2xl border border-teal-200 dark:border-teal-500/30 bg-teal-50/70 dark:bg-teal-500/10 p-3.5 text-left hover:bg-teal-100/70 dark:hover:bg-teal-500/20 transition"
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      Kovács Anna (Hypoxi -1)
                    </span>
                    <span className="rounded bg-teal-600 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                      2.4 KEZELÉS
                    </span>
                  </div>
                  <span className="mt-1 text-xs text-teal-900 dark:text-teal-300 font-bold">
                    Hypoxi Kezelés (-1 alkalom levonás)
                  </span>
                  <span className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    Monitor: „Hypoxi Kezelés. Hátralévő alkalmak: X...”
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleSimulatedScan(
                      '100002',
                      false,
                      VisitType.CIRCUIT_TRAINING,
                    )
                  }
                  className="flex flex-col items-start rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-500/10 p-3.5 text-left hover:bg-amber-100/70 dark:hover:bg-amber-500/20 transition"
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      Nagy Péter (Tartozás teszt)
                    </span>
                    <span className="rounded bg-amber-600 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                      #100002
                    </span>
                  </div>
                  <span className="mt-1 text-xs text-amber-900 dark:text-amber-300 font-medium">
                    1–5 napos tagdíj késés (22 000 Ft)
                  </span>
                  <span className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    Recepció látja a tartozást, Vendégmonitor NEM!
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const peter = guests.find((g) => g.barcode === '100002');
                    const pass = peter?.passes?.find((p) => p.isActive);
                    if (peter && pass) {
                      const res = mockStudioEngine.deductPassUsage({
                        guestId: peter.id,
                        passId: pass.id,
                        serviceId: 'srv-hypoxi',
                        operationKey: `demo-peter-${Date.now()}`,
                      });
                      showOnEmbeddedMonitor(res);
                      notify.checkInResult(res, {
                        onRevoke: (chkId) => handleRevokeCheckIn(chkId),
                      });
                      forceRender();
                    }
                  }}
                  className="flex flex-col items-start rounded-2xl border border-orange-200 dark:border-orange-500/30 bg-orange-50/70 dark:bg-orange-500/10 p-3.5 text-left hover:bg-orange-100/70 dark:hover:bg-orange-500/20 transition"
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      Nagy Péter (Utolsó 1 alk.)
                    </span>
                    <span className="rounded bg-orange-600 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                      1 ALKALOM
                    </span>
                  </div>
                  <span className="mt-1 text-xs text-orange-900 dark:text-orange-300 font-medium">
                    Utolsó 1 alkalom levonása (0 marad)
                  </span>
                  <span className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    Teszteli: Bérlet kimerülés figyelmeztetés
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSimulatedScan('100004')}
                  className="flex flex-col items-start rounded-2xl border border-rose-200 dark:border-rose-500/30 bg-rose-50/70 dark:bg-rose-500/10 p-3.5 text-left hover:bg-rose-100/70 dark:hover:bg-rose-500/20 transition"
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      Tóth Gábor (15+ nap késés)
                    </span>
                    <span className="rounded bg-rose-600 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                      #100004
                    </span>
                  </div>
                  <span className="mt-1 text-xs text-rose-800 dark:text-rose-300 font-medium">
                    15+ nap tartozás + Lejárt bérlet
                  </span>
                  <span className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    Teszteli: Diszkrét monitor elutasítás
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSimulatedScan('100006')}
                  className="flex flex-col items-start rounded-2xl border border-sky-200 dark:border-sky-500/30 bg-sky-50/70 dark:bg-sky-500/10 p-3.5 text-left hover:bg-sky-100/70 dark:hover:bg-sky-500/20 transition"
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      Horváth Dóra
                    </span>
                    <span className="rounded bg-sky-600 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                      #100006
                    </span>
                  </div>
                  <span className="mt-1 text-xs text-sky-900 dark:text-sky-300 font-medium">
                    Szüneteltetett tagság & Fagyasztott bérlet
                  </span>
                  <span className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    Teszteli: Szüneteltetés ellenőrzés
                  </span>
                </button>
              </div>
            </div>

            {/* Offline Queue & Quick Modal Triggers */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-4 flex flex-wrap items-center justify-between gap-2">
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
                    setDeductModalState({ isOpen: true, guest: guests[0] })
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-500"
                >
                  <Ticket className="h-3.5 w-3.5" />
                  Kezelés Levonó Modál
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setPaymentModalState({ isOpen: true, guest: guests[1] })
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-500"
                >
                  <Wallet className="h-3.5 w-3.5" />
                  Tagdíj Befizetés Modál
                </button>

                <button
                  type="button"
                  onClick={() => openGuestSheet(guests[0])}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
                >
                  <Users className="h-3.5 w-3.5" />
                  Adatlap
                </button>
              </div>
            </div>
          </div>

          {/* Right: Live Embedded Guest Monitor Preview */}
          <div className="lg:col-span-6 flex flex-col">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                2. Élő Adatvédett Vendégmonitor Előnézet (Soha nem mutat tartozást vagy vonalkódot)
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
                  3. Vendégek, Vendégkartoték, Digitális Kártyák és Bérletkezelés
                </h3>
                <p className="text-xs text-slate-500">
                  Kattints az „Adatlap” gombra a Tagságok, Mérések, Fényképek és Dokumentumok megtekintéséhez!
                </p>
              </div>
              <button
                type="button"
                onClick={() => openGuestSheet(null)}
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
                        <button
                          type="button"
                          onClick={() => openGuestSheet(g)}
                          className="font-bold text-slate-900 text-sm hover:text-emerald-600 hover:underline"
                        >
                          {g.lastName} {g.firstName}
                        </button>
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
                        onClick={() =>
                          handleSimulatedScan(
                            g.barcode,
                            false,
                            VisitType.CIRCUIT_TRAINING,
                          )
                        }
                        className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
                      >
                        Köredzés
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setDeductModalState({ isOpen: true, guest: g })
                        }
                        className="rounded-lg bg-teal-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-teal-500"
                      >
                        Kezelés -1
                      </button>

                      <button
                        type="button"
                        onClick={() => openGuestSheet(g)}
                        className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
                      >
                        Adatlap
                      </button>

                      <button
                        type="button"
                        onClick={() => setDigitalCardGuest(g)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        title="Digitális Belépőkártya Generátor"
                      >
                        <QrCode className="h-3.5 w-3.5 text-emerald-600" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Check-In Sztornó & Daily Cash Register Summary */}
          <div className="lg:col-span-4 space-y-6">
            <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-slate-900 dark:text-white shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  4. Napi Kassza & Fizetés Sztornó
                </span>
                <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="mt-2 text-3xl font-black text-slate-900 dark:text-white">
                {financeSummary.totalRevenue.toLocaleString('hu-HU')} Ft
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-xl bg-slate-100 dark:bg-slate-800 p-2">
                  <span className="text-slate-500 dark:text-slate-400 block">Készpénz</span>
                  <strong>
                    {financeSummary.byMethod.CASH.toLocaleString('hu-HU')} Ft
                  </strong>
                </div>
                <div className="rounded-xl bg-slate-100 dark:bg-slate-800 p-2">
                  <span className="text-slate-500 dark:text-slate-400 block">Kártya</span>
                  <strong>
                    {financeSummary.byMethod.POS_CARD.toLocaleString('hu-HU')}{' '}
                    Ft
                  </strong>
                </div>
                <div className="rounded-xl bg-slate-100 dark:bg-slate-800 p-2">
                  <span className="text-slate-500 dark:text-slate-400 block">Átutalás</span>
                  <strong>
                    {financeSummary.byMethod.BANK_TRANSFER.toLocaleString(
                      'hu-HU',
                    )}{' '}
                    Ft
                  </strong>
                </div>
              </div>

              <div className="mt-4 border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2 max-h-44 overflow-y-auto">
                {financeSummary.payments.map((pay) => (
                  <div
                    key={pay.id}
                    className={`flex items-center justify-between text-xs ${
                      pay.isCancelled ? 'line-through text-slate-400' : ''
                    }`}
                  >
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white">{pay.guestName}</span>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400">
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
                            `${pay.amount.toLocaleString('hu-HU')} Ft levonva a napi kasszából.`,
                          );
                          forceRender();
                        }}
                        className="rounded-lg bg-rose-50 dark:bg-rose-500/20 border border-rose-200 dark:border-rose-500/40 px-2 py-1 text-[11px] font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/30"
                      >
                        Sztornó
                      </button>
                    ) : (
                      <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                        SZTORNÓZVA
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-sm font-extrabold text-slate-900 mb-3">
                5. Érkezési & Kezelési Napló + Sztornó
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
                            ? 'Sztornózva'
                            : log.serviceName ?? log.passName ?? log.reason}
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
        </>
        )}
      </main>

      {/* Modals */}
      <DeductTreatmentModal
        isOpen={deductModalState.isOpen}
        initialGuest={deductModalState.guest}
        guests={guests}
        services={services}
        onClose={() => setDeductModalState({ isOpen: false, guest: null })}
        onConfirmDeduct={(data) => {
          const res = mockStudioEngine.deductPassUsage(data);
          setDeductModalState({ isOpen: false, guest: null });
          showOnEmbeddedMonitor(res);
          notify.checkInResult(res, {
            onRevoke: (chkId) => handleRevokeCheckIn(chkId),
          });
          forceRender();
        }}
        onOpenSellPass={(guest) =>
          setSellModalState({ isOpen: true, guest })
        }
      />

      <RecordPaymentModal
        isOpen={paymentModalState.isOpen}
        initialGuest={paymentModalState.guest}
        guests={guests}
        onClose={() => setPaymentModalState({ isOpen: false, guest: null })}
        onConfirmPayment={(data) => {
          const pay = mockStudioEngine.recordPayment(data);
          notify.success(
            `Befizetés rögzítve: ${pay.guestName}`,
            `${pay.amount.toLocaleString('hu-HU')} Ft (${pay.note ?? 'Befizetés'})`,
          );
          setPaymentModalState({ isOpen: false, guest: null });
          forceRender();
        }}
      />

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

      <DigitalPassCardModal
        guest={digitalCardGuest}
        onClose={() => setDigitalCardGuest(null)}
      />
    </div>
  );
};
