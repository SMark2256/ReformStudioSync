import {
  CheckInResultPayload,
  CheckInStatus,
  DUPLICATE_SCAN_COOLDOWN_SECONDS,
  GuestDto,
  OverdueBucket,
  PassStatus,
  PassType,
  PaymentMethod,
  ServiceCategory,
  VisitType,
} from '@reform/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Barcode,
  Cake,
  CheckCircle2,
  Clock,
  CloudOff,
  CreditCard,
  Edit3,
  ExternalLink,
  FileSignature,
  FlaskConical,
  KeyRound,
  LogOut,
  Megaphone,
  Monitor,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Smartphone,
  Snowflake,
  Sparkles,
  Ticket,
  Trash2,
  UserCheck,
  Users,
  Volume2,
  VolumeX,
  Wallet,
  XCircle,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ThemeToggleButton } from '@/features/toggle-theme';
import { VersionBadge } from '@/widgets/version-changelog';
import { normalizeScannedCode } from '@/shared/lib/barcode-scanner';
import {
  broadcastToScannerChannel,
  useMonitorChannel,
} from '@/shared/lib/monitor-channel';
import { api } from '@/shared/api';
import { mockStudioEngine } from '@/shared/api';
import { handleAppError } from '@/shared/lib/errors';
import { notify } from '@/shared/lib/notify';
import { soundFeedback } from '@/shared/lib/sound';
import { useAuthStore } from '@/shared/auth';
import { useOfflineQueueStore } from '@/entities/check-in';
import { useScannerChannelStore } from '@/entities/check-in';
import { useThemeStore } from '@/shared/theme';
import { DigitalPassCardModal } from '@/entities/guest';
import { GuestModal } from '@/widgets/guest-profile';
import { DeductTreatmentModal } from '@/features/deduct-treatment';
import { RecordPaymentModal } from '@/features/record-payment';
import { SellPassModal } from '@/features/sell-pass';
import { countUnseenReleaseNotes, type ReceptionMainTab } from '../model/releaseNotes';
import { useReleaseNotesStore } from '../model/releaseNotesStore';
import { WhatsNewPanel } from './WhatsNewPanel';

type ActiveTab = ReceptionMainTab | 'news';

export const ReceptionPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user, logout } = useAuthStore();
  const { theme } = useThemeStore();
  const {
    queue: offlineQueue,
    isOnline,
    setOnline,
    enqueueScan,
    clearQueue,
  } = useOfflineQueueStore();

  const [activeTab, setActiveTab] = useState<ActiveTab>('desk');
  const unseenReleaseNotes = useReleaseNotesStore((s) => countUnseenReleaseNotes(s.seenIds));
  const [manualBarcode, setManualBarcode] = useState('');
  const [guestSearch, setGuestSearch] = useState('');
  const {
    isListening: isScannerListening,
    setListening: setScannerListening,
    lastScannedCode,
    lastCheckInResult: lastCheckIn,
    recordCheckInResult: setLastCheckIn,
    recordRevokedResult,
    recordScanAttempt,
  } = useScannerChannelStore();
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [greetingSeconds, setGreetingSeconds] = useState<number>(() =>
    mockStudioEngine.getMonitorGreetingSeconds(),
  );

  // Modals
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
    preselectedDueId?: string | null;
  }>({ isOpen: false, guest: null });

  const [guestModalState, setGuestModalState] = useState<{
    isOpen: boolean;
    guest: GuestDto | null;
  }>({ isOpen: false, guest: null });

  const [digitalCardGuest, setDigitalCardGuest] = useState<GuestDto | null>(
    null,
  );

  // Admin form states
  const [newTplName, setNewTplName] = useState('');
  const [newTplType, setNewTplType] = useState<PassType>(
    PassType.OCCASION_BASED,
  );
  const [newTplPasses, setNewTplPasses] = useState<number>(10);
  const [newTplDays, setNewTplDays] = useState<number>(60);
  const [newTplPrice, setNewTplPrice] = useState<number>(54000);
  const [newDeviceName, setNewDeviceName] = useState('Recepciós Tablet #1');
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editingDeviceName, setEditingDeviceName] = useState<string>('');
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceCat, setNewServiceCat] = useState<ServiceCategory>(
    ServiceCategory.BODY_SHAPING,
  );
  const [newServiceDuration, setNewServiceDuration] = useState<number>(30);
  const [newServicePrice, setNewServicePrice] = useState<number>(7500);

  const { connectedDisplays } = useMonitorChannel();

  // Queries
  const guestsQuery = useQuery({
    queryKey: ['guests', guestSearch],
    queryFn: () => api.getGuests(guestSearch),
  });

  const servicesQuery = useQuery({
    queryKey: ['services'],
    queryFn: () => api.getServices(true),
  });

  const templatesQuery = useQuery({
    queryKey: ['pass-templates'],
    queryFn: () => api.getPassTemplates(true),
  });

  const todayCheckInsQuery = useQuery({
    queryKey: ['today-checkins'],
    queryFn: () => api.getTodayCheckIns(),
  });

  const todayDashboardQuery = useQuery({
    queryKey: ['today-dashboard'],
    queryFn: () => api.getTodayDashboard(),
  });

  const overdueQuery = useQuery({
    queryKey: ['overdue-memberships'],
    queryFn: () => api.getOverdueMemberships(),
  });

  const financeQuery = useQuery({
    queryKey: ['daily-finance'],
    queryFn: () => api.getDailyFinanceSummary(),
  });

  const devicesQuery = useQuery({
    queryKey: ['display-devices'],
    queryFn: () => api.getDisplayDevices(),
    refetchInterval: activeTab === 'admin' ? 4000 : false,
  });

  const refreshAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['guests'] });
    queryClient.invalidateQueries({ queryKey: ['services'] });
    queryClient.invalidateQueries({ queryKey: ['today-checkins'] });
    queryClient.invalidateQueries({ queryKey: ['today-dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['overdue-memberships'] });
    queryClient.invalidateQueries({ queryKey: ['daily-finance'] });
    queryClient.invalidateQueries({ queryKey: ['pass-templates'] });
    queryClient.invalidateQueries({ queryKey: ['display-devices'] });
  }, [queryClient]);

  // Keep open guest modal fresh when queries refresh
  const activeModalGuest = guestModalState.guest
    ? (guestsQuery.data ?? []).find((g) => g.id === guestModalState.guest?.id) ??
      guestModalState.guest
    : null;

  // Helper to open Sell Pass Modal by guestId
  const openSellModalByGuestId = useCallback(
    (guestId: string, suggestedTemplateId?: string | null) => {
      const found = (guestsQuery.data ?? []).find((g) => g.id === guestId);
      if (found) {
        setSellModalState({
          isOpen: true,
          guest: found,
          preselectedTemplateId: suggestedTemplateId,
        });
      }
    },
    [guestsQuery.data],
  );

  // Mutations
  const revokeMutation = useMutation({
    mutationFn: (checkInId: string) => api.revokeCheckIn(checkInId),
    onSuccess: (res) => {
      notify.success(
        `Beléptetés sztornózva: ${res.guestName}`,
        `Az alkalom visszaírva. Új egyenleg: ${res.restoredRemainingPasses}`,
      );
      recordRevokedResult(res);
      broadcastToScannerChannel({ type: 'CHECKIN_REVOKED', payload: res });
      refreshAll();
    },
  });

  const scanMutation = useMutation({
    mutationFn: (vars: {
      barcode: string;
      forceDuplicate?: boolean;
      visitType?: VisitType;
    }) =>
      api.scanCheckIn({
        barcode: vars.barcode,
        forceDuplicate: vars.forceDuplicate,
        visitType: vars.visitType ?? VisitType.CIRCUIT_TRAINING,
      }),
    onSuccess: (res) => {
      setLastCheckIn(res);
      broadcastToScannerChannel({ type: 'CHECKIN_RESULT', payload: res });
      notify.checkInResult(res, {
        onRevoke: (checkInId) => revokeMutation.mutate(checkInId),
        onForceDuplicate: (barcode) =>
          scanMutation.mutate({
            barcode,
            forceDuplicate: true,
            visitType: VisitType.CIRCUIT_TRAINING,
          }),
        onOpenSellModal: (guestId, suggestedTemplateId) =>
          openSellModalByGuestId(guestId, suggestedTemplateId),
      });
      refreshAll();
    },
  });

  const deductTreatmentMutation = useMutation({
    mutationFn: api.deductPassUsage,
    onSuccess: (res) => {
      setLastCheckIn(res);
      broadcastToScannerChannel({ type: 'CHECKIN_RESULT', payload: res });
      setDeductModalState({ isOpen: false, guest: null });
      notify.checkInResult(res, {
        onRevoke: (checkInId) => revokeMutation.mutate(checkInId),
        onOpenSellModal: (guestId, suggestedTemplateId) =>
          openSellModalByGuestId(guestId, suggestedTemplateId),
      });
      refreshAll();
    },
  });

  const recordPaymentMutation = useMutation({
    mutationFn: api.recordPayment,
    onSuccess: (payment) => {
      notify.success(
        `Befizetés rögzítve: ${payment.guestName}`,
        `${payment.amount.toLocaleString('hu-HU')} Ft (${payment.note ?? 'Befizetés'})`,
      );
      setPaymentModalState({ isOpen: false, guest: null });
      refreshAll();
    },
  });

  const handleBarcodeScan = useCallback(
    (barcode: string) => {
      const code = normalizeScannedCode(barcode);
      if (!code) return;

      recordScanAttempt(code);

      if (!isOnline) {
        const queued = enqueueScan(code);
        notify.warning(
          `Offline mód: Vonalkód várólistára mentve (${queued.barcode})`,
          'Az internetkapcsolat helyreállásakor automatikusan szinkronizálódik.',
        );
        return;
      }

      scanMutation.mutate({
        barcode: code,
        visitType: VisitType.CIRCUIT_TRAINING,
      });
    },
    [isOnline, enqueueScan, scanMutation, recordScanAttempt],
  );

  // Online / Offline listener + automatic FIFO queue sync
  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOnline]);

  const syncOfflineQueue = useCallback(async () => {
    if (offlineQueue.length === 0) return;
    try {
      const res = await api.syncOfflineScans(offlineQueue);
      clearQueue();
      notify.success(
        `Offline várólista szinkronizálva (${res.processed} tétel)!`,
        'Minden várakozó beléptetés feldolgozásra került.',
      );
      refreshAll();
    } catch (err) {
      handleAppError(err, { title: 'Offline szinkronizáció sikertelen' });
    }
  }, [offlineQueue, clearQueue, refreshAll]);

  useEffect(() => {
    if (isOnline && offlineQueue.length > 0) {
      syncOfflineQueue();
    }
  }, [isOnline, offlineQueue.length, syncOfflineQueue]);

  const sellPassMutation = useMutation({
    mutationFn: api.sellPass,
    onSuccess: (res) => {
      notify.success(
        `Bérlet sikeresen rögzítve: ${res.pass.passTemplateName ?? 'Bérlet'}`,
        `Fizetve: ${res.amount.toLocaleString('hu-HU')} Ft`,
      );
      setSellModalState({ isOpen: false, guest: null });
      refreshAll();
    },
  });

  const saveGuestMutation = useMutation({
    mutationFn: async (data: {
      id?: string;
      firstName: string;
      lastName: string;
      barcode?: string;
      email?: string;
      phone?: string;
      birthDate?: string | null;
      nameDay?: string | null;
      notes?: string;
    }) => {
      if (data.id) {
        return api.updateGuest(data.id, data);
      }
      return api.createGuest(data);
    },
    onSuccess: (savedGuest, vars) => {
      notify.success(
        vars.id ? 'Vendég adatai frissítve!' : 'Új vendég sikeresen felvéve!',
        `${savedGuest.lastName} ${savedGuest.firstName} (Kártya: ${savedGuest.barcode})`,
      );
      if (!vars.id) {
        closeGuestSheet();
      }
      refreshAll();
    },
  });

  const extendPassMutation = useMutation({
    mutationFn: (vars: {
      passId: string;
      additionalDays: number;
      note: string;
    }) => api.extendPass(vars.passId, vars.additionalDays, vars.note),
    onSuccess: (updatedPass, vars) => {
      notify.success(
        `Bérlet meghosszabbítva (+${vars.additionalDays} nap)!`,
        `Új lejárati dátum: ${new Date(updatedPass.expirationDate).toLocaleDateString('hu-HU')}`,
      );
      refreshAll();
    },
  });

  const toggleFreezeMutation = useMutation({
    mutationFn: (vars: { passId: string; note?: string }) =>
      api.toggleFreezePass(vars.passId, vars.note),
    onSuccess: (updatedPass) => {
      notify.success(
        updatedPass.isFrozen
          ? 'Bérlet sikeresen fagyasztva!'
          : 'Bérlet fagyasztása feloldva!',
        `Érvényesség vége: ${new Date(updatedPass.expirationDate).toLocaleDateString('hu-HU')}`,
      );
      refreshAll();
    },
  });

  const cancelPaymentMutation = useMutation({
    mutationFn: (vars: { paymentId: string; reason?: string }) =>
      api.cancelPayment(vars.paymentId, vars.reason),
    onSuccess: (cancelled) => {
      notify.warning(
        `Fizetési tétel sztornózva: ${cancelled.guestName}`,
        `${cancelled.amount.toLocaleString('hu-HU')} Ft levonva a napi kasszából.`,
      );
      refreshAll();
    },
  });

  const createTemplateMutation = useMutation({
    mutationFn: api.createPassTemplate,
    onSuccess: (tpl) => {
      notify.success(
        'Új bérletsablon létrehozva!',
        `${tpl.name} (${tpl.price.toLocaleString('hu-HU')} Ft)`,
      );
      setNewTplName('');
      refreshAll();
    },
  });

  const createServiceMutation = useMutation({
    mutationFn: api.createService,
    onSuccess: (srv) => {
      notify.success(
        'Új szolgáltatás létrehozva!',
        `${srv.name} (${srv.durationMinutes} perc)`,
      );
      setNewServiceName('');
      refreshAll();
    },
  });

  const initPairingMutation = useMutation({
    mutationFn: (name: string) => api.initDisplayPairing(name),
    onSuccess: (device) => {
      notify.success(
        `6 jegyű párosító kód generálva: ${device.pairingCode}`,
        `Írd be ezt a kódot (10 percig érvényes) a(z) "${device.name}" eszköz /monitor oldalán!`,
      );
      setNewDeviceName('');
      refreshAll();
    },
    onError: (err) => {
      handleAppError(err, { title: 'Nem sikerült kódot generálni' });
    },
  });

  const regenerateCodeMutation = useMutation({
    mutationFn: (deviceId: string) => api.regenerateDisplayPairingCode(deviceId),
    onSuccess: (device) => {
      notify.info(
        `Új 6 jegyű párosító kód generálva: ${device.pairingCode}`,
        `A korábbi párosítás érvényét vesztette. Írd be az új kódot a(z) "${device.name}" eszközön!`,
      );
      refreshAll();
    },
    onError: (err) => {
      handleAppError(err, { title: 'Kód újragenerálása sikertelen' });
    },
  });

  const renameDeviceMutation = useMutation({
    mutationFn: (vars: { deviceId: string; name: string }) =>
      api.renameDisplayDevice(vars.deviceId, vars.name),
    onSuccess: (device) => {
      notify.success(
        'Kijelző sikeresen átnevezve!',
        `Új név: ${device.name}`,
      );
      setEditingDeviceId(null);
      setEditingDeviceName('');
      refreshAll();
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
      refreshAll();
    },
    onError: (err) => {
      handleAppError(err, { title: 'Törlés sikertelen' });
    },
  });

  const testSignalMutation = useMutation({
    mutationFn: (deviceId?: string) => api.sendMonitorTestSignal(deviceId),
    onSuccess: (res) => {
      notify.success('Teszt jel elküldve!', res.message);
      refreshAll();
    },
    onError: (err) => {
      handleAppError(err, { title: 'Teszt jel küldése sikertelen' });
    },
  });

  const openSecondaryMonitorWindow = () => {
    window.open(
      '/monitor',
      'ReformStudioGuestMonitor',
      'width=1280,height=800,menubar=no,toolbar=no,location=no,status=no',
    );
    notify.info(
      'Másodlagos Vendégmonitor ablak megnyitva',
      'Húzd át az ablakot a pult felé néző kijelzőre és nyomj Teljes Képernyőt.',
    );
  };

  const lastIdentifiedGuest = lastCheckIn?.guestId
    ? (guestsQuery.data ?? []).find((g) => g.id === lastCheckIn.guestId) ?? null
    : null;

  const dashboard = todayDashboardQuery.data;

  const openGuestSheet = (guest: GuestDto | null) => {
    setGuestModalState({ isOpen: true, guest });
    navigate(location.pathname, {
      state: {
        mainTab: activeTab,
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
        mainTab: activeTab,
        guestSheetOpen: false,
        guestId: null,
        guestSnapshot: null,
        guestSubTab: 'overview',
      },
    });
  };

  const handleSelectMainTab = (nextTab: ActiveTab) => {
    if (!guestModalState.isOpen && nextTab === activeTab) return;
    setGuestModalState({ isOpen: false, guest: null });
    setActiveTab(nextTab);
    navigate(location.pathname, {
      state: {
        mainTab: nextTab,
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
        mainTab?: ActiveTab;
        guestSheetOpen?: boolean;
        guestId?: string | null;
        guestSnapshot?: GuestDto | null;
      } | null) ?? null;

    if (!st) {
      setActiveTab('desk');
      setGuestModalState({ isOpen: false, guest: null });
      return;
    }

    setActiveTab(st.mainTab ?? 'desk');
    if (st.guestSheetOpen) {
      const matched =
        st.guestId && st.guestId !== '__NEW__'
          ? ((guestsQuery.data ?? []).find((g) => g.id === st.guestId) ??
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
      className={`min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col transition-colors duration-200 ${
        theme === 'dark' ? 'reception-theme-dark dark' : ''
      }`}
    >
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30">
              <Sparkles className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
                  RE-FORM Stúdió
                </h1>
                <VersionBadge />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Bejelentkezve: {user?.name ?? 'Recepciós Munkatárs'}
              </p>
            </div>
          </div>

          {/* Center Tabs */}
          <nav className="flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
            {[
              { id: 'desk', label: 'Recepciós Pult', icon: Barcode },
              { id: 'guests', label: 'Vendégkartoték', icon: Users },
              { id: 'finance', label: 'Pénzügy & Tartozások', icon: Wallet },
              { id: 'admin', label: 'Szolgáltatások & Monitor', icon: Settings },
              { id: 'news', label: 'Újdonságok', icon: Megaphone },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = !guestModalState.isOpen && activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleSelectMainTab(tab.id as ActiveTab)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    active
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                  {tab.id === 'news' && unseenReleaseNotes > 0 && (
                    <span
                      className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white"
                      title={`${unseenReleaseNotes} még nem látott újdonság`}
                    >
                      {unseenReleaseNotes}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Status & Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const next = !isScannerListening;
                setScannerListening(next);
                notify.info(
                  next
                    ? 'Folyamatos QR/Vonalkód figyelés bekapcsolva'
                    : 'QR/Vonalkód csatorna szüneteltetve',
                  next
                    ? 'A rendszer minden oldalon folyamatosan figyeli a beérkező QR és vonalkódokat.'
                    : 'A háttérbeli automatikus HID leolvasás ideiglenesen kikapcsolva.',
                );
              }}
              title="Globális QR / Vonalkód Szkenner Csatorna állapota (minden oldalon aktív)"
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold border transition-all ${
                isScannerListening
                  ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}
            >
              <QrCode className="h-3.5 w-3.5" />
              <span>
                {isScannerListening
                  ? `QR Csatorna: Aktív${lastScannedCode ? ` (#${lastScannedCode})` : ''}`
                  : 'QR Csatorna: Szünetel'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setOnline(!isOnline)}
              title="Kattints az Offline / Online mód szimulálásához"
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold border transition-all ${
                isOnline
                  ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'border-amber-500/40 bg-amber-500/20 text-amber-800 dark:text-amber-300'
              }`}
            >
              {isOnline ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Online ({connectedDisplays} kijelző)
                </>
              ) : (
                <>
                  <CloudOff className="h-3.5 w-3.5" />
                  Offline Puffer ({offlineQueue.length})
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                const next = !soundEnabled;
                setSoundEnabled(next);
                soundFeedback.setEnabled(next);
                notify.info(
                  next ? 'Hangjelzések bekapcsolva' : 'Hangjelzések némítva',
                );
              }}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              title="Hangjelzés ki/bekapcsolása"
            >
              {soundEnabled ? (
                <Volume2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <VolumeX className="h-4 w-4 text-slate-400" />
              )}
            </button>

            <ThemeToggleButton />

            <Link
              to="/tablet"
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700"
              title="Tablet dokumentum-kitöltő és aláíró nézet"
            >
              <FileSignature className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
              Tablet Aláíró
            </Link>

            <button
              type="button"
              onClick={openSecondaryMonitorWindow}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              <Monitor className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              Vendégmonitor
              <ExternalLink className="h-3 w-3 text-slate-400" />
            </button>

            <Link
              to="/demo"
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
            >
              <FlaskConical className="h-3.5 w-3.5" />
              Demo Oldal
            </Link>

            <button
              type="button"
              onClick={() => {
                logout();
                notify.info(
                  'Sikeres kijelentkezés',
                  'A munkamenet lezárult.',
                );
                navigate('/login');
              }}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white"
              title="Kijelentkezés a recepciós munkamenetből"
            >
              <LogOut className="h-3.5 w-3.5 text-rose-400" />
              Kilépés
            </button>
          </div>
        </div>
      </header>

      {/* Offline Queue Banner if items waiting */}
      {offlineQueue.length > 0 && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CloudOff className="h-4 w-4" />
            <span>
              Offline Olvasási Pufferben {offlineQueue.length} db beléptetés várakozik szinkronizálásra.
            </span>
          </div>
          <button
            type="button"
            onClick={syncOfflineQueue}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1 text-white hover:bg-slate-800"
          >
            <RefreshCw className="h-3 w-3" />
            Azonnali Szinkronizálás
          </button>
        </div>
      )}

      {/* Main Content */}
      <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 space-y-4">
        {guestModalState.isOpen ? (
          <GuestModal
            isOpen={guestModalState.isOpen}
            guest={activeModalGuest}
            services={servicesQuery.data ?? []}
            backLabel="Vissza a vendégkartotékra"
            onClose={closeGuestSheet}
            onSaveGuest={(data) => saveGuestMutation.mutate(data)}
            onExtendPass={(passId, additionalDays, note) =>
              extendPassMutation.mutate({ passId, additionalDays, note })
            }
            onToggleFreezePass={(passId, note) =>
              toggleFreezeMutation.mutate({ passId, note })
            }
            onOpenDigitalCard={(g) => setDigitalCardGuest(g)}
            onRefreshAll={refreshAll}
          />
        ) : (
          <>
        {activeTab === 'desk' && (
          <div className="space-y-6">
            {/* 5.1 Recepciós Főképernyő — 5 Kötelező Gyorsgomb + Napi KPI Sáv */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <button
                type="button"
                onClick={() => {
                  const g = lastIdentifiedGuest ?? guestsQuery.data?.[0];
                  if (g) handleBarcodeScan(g.barcode);
                }}
                className="flex items-center gap-3 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 p-3.5 text-left shadow-sm hover:border-emerald-500 transition"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">
                    1. Beléptetés
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Köredzés (0 levonás)
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  setDeductModalState({
                    isOpen: true,
                    guest: lastIdentifiedGuest,
                  })
                }
                className="flex items-center gap-3 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 p-3.5 text-left shadow-sm hover:border-emerald-500 transition"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300">
                  <Ticket className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">
                    2. Alkalom levonása
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Kezelés (pl. Hypoxi -1)
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  setSellModalState({
                    isOpen: true,
                    guest: lastIdentifiedGuest ?? guestsQuery.data?.[0] ?? null,
                  })
                }
                className="flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 text-left shadow-sm hover:border-emerald-500 transition"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">
                    3. Új bérlet
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Bérlet értékesítés
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  setPaymentModalState({
                    isOpen: true,
                    guest: lastIdentifiedGuest,
                  })
                }
                className="flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 text-left shadow-sm hover:border-emerald-500 transition"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
                  <Wallet className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">
                    4. Befizetés
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Tagdíj / Részbefizetés
                  </span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => openGuestSheet(null)}
                className="flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 text-left shadow-sm hover:border-emerald-500 transition"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  <Plus className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">
                    5. Új vendég
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Kartoték & Vonalkód
                  </span>
                </div>
              </button>
            </div>

            {/* Napi KPI mutatók (4.1): Érkezések, Bevételek, Tartozások (1-5, 6-15, 15+), Lejáró bérletek, Születés- és névnapok */}
            {dashboard && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
                  <span className="text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
                    Mai Forgalom & Kezelések
                  </span>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-slate-900 dark:text-white">
                      {dashboard.arrivalsCount +
                        dashboard.treatmentsUsedCount}{' '}
                      fő
                    </span>
                    <span className="text-xs text-slate-500">
                      ({dashboard.circuitArrivalsCount} köredzés •{' '}
                      {dashboard.treatmentsUsedCount} kezelés)
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
                  <span className="text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
                    Mai / Havi Bevétel
                  </span>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                      {dashboard.todayRevenueHuf.toLocaleString('hu-HU')} Ft
                    </span>
                    <span className="text-xs text-slate-500">
                      Havi: {dashboard.monthlyRevenueHuf.toLocaleString('hu-HU')} Ft
                    </span>
                  </div>
                </div>

                <div
                  onClick={() => handleSelectMainTab('finance')}
                  className="cursor-pointer rounded-2xl border border-rose-200 dark:border-rose-800/70 bg-rose-50/50 dark:bg-rose-950/30 p-4 shadow-sm hover:border-rose-400 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase text-rose-700 dark:text-rose-300">
                      Lejárt Tagdíj Tartozások ({dashboard.overdueCount} fő)
                    </span>
                    <AlertTriangle className="h-4 w-4 text-rose-600" />
                  </div>
                  <p className="mt-1 text-xl font-black text-rose-700 dark:text-rose-300">
                    {dashboard.overdueTotalHuf.toLocaleString(
                      'hu-HU',
                    )}{' '}
                    Ft
                  </p>
                  <div className="mt-1 flex gap-2 text-[10px] font-semibold text-rose-800 dark:text-rose-200">
                    <span>1–5 nap: {dashboard.overdueByBucket.DAYS_1_5}</span>
                    <span>•</span>
                    <span>6–15 nap: {dashboard.overdueByBucket.DAYS_6_15}</span>
                    <span>•</span>
                    <span>15+ nap: {dashboard.overdueByBucket.DAYS_OVER_15}</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-amber-200 dark:border-amber-800/70 bg-amber-50/50 dark:bg-amber-950/30 p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase text-amber-800 dark:text-amber-300">
                      Mai Ünnepeltek & Figyelmeztetések
                    </span>
                    <Cake className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="mt-1.5 space-y-1 text-xs">
                    {dashboard.celebrants.length > 0 ? (
                      dashboard.celebrants.map((c, idx) => (
                        <div
                          key={`${c.guestId}-${idx}`}
                          className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1"
                        >
                          🎉 {c.guestName}:{' '}
                          {c.type === 'BIRTHDAY'
                            ? 'Boldog születésnapot!'
                            : `Boldog névnapot (${c.detail})!`}
                        </div>
                      ))
                    ) : (
                      <span className="text-slate-500">
                        Ma nincs születés- vagy névnapos vendég.
                      </span>
                    )}
                    {dashboard.expiringPasses.length > 0 && (
                      <div className="text-[11px] text-amber-800 dark:text-amber-300 font-medium">
                        ⚠️ {dashboard.expiringPasses.length} bérlet hamarosan lejár / 1-2 alkalmas!
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Left Column: Scanner Bar & Last Check-In Card */}
              <div className="lg:col-span-7 space-y-6">
                {/* Barcode Scanner Input Box */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Barcode className="h-5 w-5 text-emerald-600" />
                      <div>
                        <h2 className="text-base font-bold text-slate-900">
                          Vonalkódos Köredzés Érkezés (2.3) & Vendégazonosítás
                        </h2>
                        <p className="text-xs text-slate-500">
                          Köredzés csippantáskor 0 alkalom vonódik le ({DUPLICATE_SCAN_COOLDOWN_SECONDS} mp dupla leolvasás védelem). Alkalmas kezeléshez kattints az „Alkalom levonása” gombra!
                        </p>
                      </div>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200 shrink-0">
                      {isScannerListening
                        ? 'QR / 2D HID Csatorna Aktív'
                        : 'QR Csatorna Szünetel'}
                    </span>
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!manualBarcode.trim()) return;
                      handleBarcodeScan(manualBarcode);
                      setManualBarcode('');
                    }}
                    className="flex gap-2.5"
                  >
                    <input
                      type="text"
                      data-barcode-input="true"
                      value={manualBarcode}
                      onChange={(e) => setManualBarcode(e.target.value)}
                      placeholder="Csippantsd le a QR-kódot / kártyát bárhol, vagy írd be a kódot (pl. 100001)..."
                      className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-mono focus:border-emerald-600 focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-500"
                    >
                      Köredzés Beléptetés
                    </button>
                  </form>

                  {/* Quick Scan Pills */}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-slate-400 mr-1">Gyors tesztkódok:</span>
                    {[
                      { code: '100001', label: 'Kovács Anna (Havi tagság + Hypoxi)' },
                      { code: '100002', label: 'Nagy Péter (1–5 nap késés + 1 alk.)' },
                      { code: '100003', label: 'Szabó Eszter (Érvényes)' },
                      { code: '100004', label: 'Tóth Gábor (15+ nap tartozás)' },
                      { code: '100005', label: 'Varga Zsófia (6–15 nap részfiz.)' },
                      { code: '100006', label: 'Horváth Dóra (Szüneteltetett)' },
                    ].map((item) => (
                      <button
                        key={item.code}
                        type="button"
                        onClick={() => handleBarcodeScan(item.code)}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-700 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-800"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Last Identified Guest Card (5.1) */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                      Utoljára Azonosított Vendég Kártya & Gyorsműveletek
                    </h3>
                    {lastCheckIn && (
                      <span className="font-mono text-xs text-slate-400">
                        {new Date(lastCheckIn.timestamp).toLocaleTimeString(
                          'hu-HU',
                        )}
                      </span>
                    )}
                  </div>

                  {!lastCheckIn ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-10 text-center">
                      <Ticket className="h-10 w-10 text-slate-300 mb-2" />
                      <p className="text-sm font-medium text-slate-600">
                        Még nem történt vendégazonosítás ebben a munkamenetben.
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Olvass be egy vonalkódot vagy válassz a fenti tesztgombok közül.
                      </p>
                    </div>
                  ) : (
                    <div
                      className={`rounded-2xl border p-5 ${
                        lastCheckIn.status === CheckInStatus.SUCCESS
                          ? 'border-emerald-200 bg-emerald-50/60'
                          : lastCheckIn.status === CheckInStatus.DUPLICATE_SCAN
                            ? 'border-amber-200 bg-amber-50/70'
                            : 'border-rose-200 bg-rose-50/70'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          {lastCheckIn.status === CheckInStatus.SUCCESS ? (
                            <CheckCircle2 className="h-8 w-8 text-emerald-600 shrink-0 mt-0.5" />
                          ) : lastCheckIn.status ===
                            CheckInStatus.DUPLICATE_SCAN ? (
                            <AlertTriangle className="h-8 w-8 text-amber-600 shrink-0 mt-0.5" />
                          ) : (
                            <XCircle className="h-8 w-8 text-rose-600 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-xl font-extrabold text-slate-900">
                                {lastCheckIn.guestName}
                              </h4>
                              <span className="rounded-md bg-white px-2 py-0.5 font-mono text-xs text-slate-600 border border-slate-200">
                                #{lastCheckIn.barcode}
                              </span>
                              <span className="rounded-full bg-emerald-700 px-2.5 py-0.5 text-[10px] font-bold uppercase text-white">
                                {lastCheckIn.mode === 'CIRCUIT_GREETING'
                                  ? 'Köredzés (0 levonás)'
                                  : `Kezelés: ${lastCheckIn.serviceName ?? 'Alkalom levonás'}`}
                              </span>
                            </div>

                            <p className="mt-1 text-sm font-medium text-slate-700">
                              {lastCheckIn.passName ??
                                lastCheckIn.reason ??
                                'Nincs aktív bérlet'}
                            </p>

                            {lastCheckIn.overdueAmountHuf &&
                              lastCheckIn.overdueAmountHuf > 0 && (
                                <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-rose-100 border border-rose-300 px-2.5 py-1 text-xs font-bold text-rose-800">
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                  Havi tagdíj elmaradás (Csak recepción látható!):{' '}
                                  {lastCheckIn.overdueAmountHuf.toLocaleString(
                                    'hu-HU',
                                  )}{' '}
                                  Ft ({lastCheckIn.overdueDays ?? 1} nap késés)
                                </div>
                              )}

                            {(lastCheckIn.status === CheckInStatus.SUCCESS ||
                              lastCheckIn.status ===
                                CheckInStatus.DUPLICATE_SCAN) &&
                              lastCheckIn.mode !== 'CIRCUIT_GREETING' && (
                                <p className="mt-1 text-xs text-slate-600">
                                  Maradék alkalmak:{' '}
                                  <strong className="text-slate-900">
                                    {lastCheckIn.remainingPasses === 'Korlátlan'
                                      ? 'Korlátlan'
                                      : `${lastCheckIn.remainingPasses} / ${lastCheckIn.totalPasses ?? '?'} db`}
                                  </strong>{' '}
                                  • Érvényes:{' '}
                                  <strong>
                                    {lastCheckIn.expirationDate
                                      ? new Date(
                                          lastCheckIn.expirationDate,
                                        ).toLocaleDateString('hu-HU')
                                      : '—'}
                                  </strong>
                                </p>
                              )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {lastIdentifiedGuest && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  openGuestSheet(lastIdentifiedGuest)
                                }
                                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800"
                              >
                                <Users className="h-3.5 w-3.5" />
                                Adatlap
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  setDeductModalState({
                                    isOpen: true,
                                    guest: lastIdentifiedGuest,
                                  })
                                }
                                className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-teal-500"
                              >
                                <Ticket className="h-3.5 w-3.5" />
                                Kezelés Levonása (pl. Hypoxi)
                              </button>
                            </>
                          )}

                          {lastCheckIn.status === CheckInStatus.SUCCESS &&
                            lastCheckIn.checkInId && (
                              <button
                                type="button"
                                onClick={() =>
                                  revokeMutation.mutate(lastCheckIn.checkInId!)
                                }
                                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3.5 py-2 text-xs font-bold text-amber-800 shadow-sm hover:bg-amber-50"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Sztornó / Visszavonás
                              </button>
                            )}

                          {lastCheckIn.status ===
                            CheckInStatus.DUPLICATE_SCAN && (
                            <button
                              type="button"
                              onClick={() =>
                                scanMutation.mutate({
                                  barcode: lastCheckIn.barcode,
                                  forceDuplicate: true,
                                })
                              }
                              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-500"
                            >
                              Mégis rögzítés
                            </button>
                          )}

                          {lastCheckIn.guestId && (
                            <button
                              type="button"
                              onClick={() =>
                                openSellModalByGuestId(
                                  lastCheckIn.guestId!,
                                  lastCheckIn.suggestedRenewalTemplateId,
                                )
                              }
                              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-500"
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                              Új Bérlet Eladása
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Quick Guest Search on Reception Desk */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-slate-900">
                      Vendég Gyorskereső (Név, telefon, e-mail vagy vonalkód)
                    </h3>
                    <button
                      type="button"
                      onClick={() => openGuestSheet(null)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Új Vendég
                    </button>
                  </div>

                  <div className="relative mb-3">
                    <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={guestSearch}
                      onChange={(e) => setGuestSearch(e.target.value)}
                      placeholder="Keresés név, telefonszám vagy vonalkód alapján..."
                      className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                    {(guestsQuery.data ?? []).map((g) => {
                      const activePass = (g.passes ?? []).find(
                        (p) => p.status === PassStatus.ACTIVE,
                      );
                      const frozenPass = (g.passes ?? []).find(
                        (p) => p.isFrozen,
                      );

                      return (
                        <div
                          key={g.id}
                          className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openGuestSheet(g)}
                                className="font-bold text-sm text-slate-900 hover:text-emerald-600 underline-offset-2 hover:underline"
                              >
                                {g.lastName} {g.firstName}
                              </button>
                              <span className="font-mono text-xs text-slate-500">
                                #{g.barcode}
                              </span>
                              {frozenPass && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-800">
                                  <Snowflake className="h-3 w-3" />
                                  Fagyasztva
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500">
                              {activePass
                                ? `${activePass.passTemplateName} (${
                                    activePass.type === PassType.TIME_BASED
                                      ? 'Korlátlan'
                                      : `${activePass.remainingPasses} alk.`
                                  })`
                                : 'Nincs aktív bérlet'}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleBarcodeScan(g.barcode)}
                              className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
                              title="Köredzés érkezés rögzítése (0 levonás)"
                            >
                              Köredzés
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDeductModalState({ isOpen: true, guest: g })
                              }
                              className="rounded-lg bg-teal-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-teal-500"
                              title="Kezelés kiválasztása és 1 alkalom levonása"
                            >
                              Kezelés -1
                            </button>
                            <button
                              type="button"
                              onClick={() => openGuestSheet(g)}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Adatlap
                            </button>
                            <button
                              type="button"
                              onClick={() => setDigitalCardGuest(g)}
                              className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100"
                              title="Digitális Kártya (QR & Vonalkód)"
                            >
                              <QrCode className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column: Live Today's Check-Ins & Quick Cash Summary */}
              <div className="lg:col-span-5 space-y-6">
                {/* Quick Finance Summary Card */}
                <div className="rounded-2xl border border-slate-200 bg-slate-900 p-5 text-white shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                      Mai Kassza Gyorsösszesítő
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSelectMainTab('finance')}
                      className="text-xs text-slate-300 underline hover:text-white"
                    >
                      Tartozások & Részletes zárás →
                    </button>
                  </div>
                  <p className="mt-2 text-3xl font-black">
                    {(financeQuery.data?.totalRevenue ?? 0).toLocaleString(
                      'hu-HU',
                    )}{' '}
                    Ft
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-xl bg-slate-800 p-2.5">
                      <span className="text-slate-400 block">Készpénz</span>
                      <strong className="text-white">
                        {(financeQuery.data?.byMethod.CASH ?? 0).toLocaleString(
                          'hu-HU',
                        )}{' '}
                        Ft
                      </strong>
                    </div>
                    <div className="rounded-xl bg-slate-800 p-2.5">
                      <span className="text-slate-400 block">Bankkártya</span>
                      <strong className="text-white">
                        {(
                          financeQuery.data?.byMethod.POS_CARD ?? 0
                        ).toLocaleString('hu-HU')}{' '}
                        Ft
                      </strong>
                    </div>
                    <div className="rounded-xl bg-slate-800 p-2.5">
                      <span className="text-slate-400 block">Átutalás</span>
                      <strong className="text-white">
                        {(
                          financeQuery.data?.byMethod.BANK_TRANSFER ?? 0
                        ).toLocaleString('hu-HU')}{' '}
                        Ft
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Today's Check-In & Treatment Log */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-900 mb-3">
                    Mai Érkezési & Kezelési Napló ({todayCheckInsQuery.data?.length ?? 0})
                  </h3>
                  <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
                    {(todayCheckInsQuery.data ?? []).map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center justify-between gap-2 py-2.5 text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`h-2 w-2 rounded-full ${
                                log.status === CheckInStatus.SUCCESS
                                  ? 'bg-emerald-500'
                                  : log.status === CheckInStatus.CANCELLED
                                    ? 'bg-amber-500'
                                    : 'bg-rose-500'
                              }`}
                            />
                            <span className="font-bold text-slate-900">
                              {log.guestName}
                            </span>
                            <span className="font-mono text-slate-400">
                              #{log.guestBarcode}
                            </span>
                            {log.serviceName && (
                              <span className="rounded bg-teal-50 dark:bg-teal-900/40 px-1.5 py-0.5 text-[10px] font-bold text-teal-700 dark:text-teal-300">
                                {log.serviceName}
                              </span>
                            )}
                          </div>
                          <p className="text-slate-500 mt-0.5">
                            {log.status === CheckInStatus.CANCELLED
                              ? `VISSZAVONVA (${log.reversalReason ?? 'Sztornó'})`
                              : log.passName ?? log.reason ?? log.status}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="font-mono text-slate-400">
                            {new Date(log.createdAt).toLocaleTimeString('hu-HU', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {log.status === CheckInStatus.SUCCESS && (
                            <button
                              type="button"
                              onClick={() => revokeMutation.mutate(log.id)}
                              className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 font-semibold text-amber-800 hover:bg-amber-100"
                              title="Visszavonás (Sztornó)"
                            >
                              Sztornó
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'guests' && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Vendégkartoték
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Áttekintés, Havi Tagságok, Bérletek, Kezelések, Befizetések, Mérések, Fényképek és Dokumentumok.
                </p>
              </div>
              <button
                type="button"
                onClick={() => openGuestSheet(null)}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-500"
              >
                <Plus className="h-4 w-4" />
                Új Vendég Felvétele
              </button>
            </div>

            <div className="relative">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={guestSearch}
                onChange={(e) => setGuestSearch(e.target.value)}
                placeholder="Keresés név, vonalkód, telefonszám vagy e-mail alapján..."
                className="w-full rounded-xl border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="py-3 px-3">Vendég</th>
                    <th className="py-3 px-3">Kártya</th>
                    <th className="py-3 px-3">Elérhetőség</th>
                    <th className="py-3 px-3">Tagság & Bérletek</th>
                    <th className="py-3 px-3 text-right">Műveletek</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(guestsQuery.data ?? []).map((g) => {
                    // Számolt állapot: a lejárt, elfogyott vagy sztornózott bérlet nem látszik, a fagyasztott igen.
                    const usablePasses = (g.passes ?? []).filter(
                      (p) =>
                        p.status === PassStatus.ACTIVE ||
                        p.status === PassStatus.FROZEN,
                    );
                    const activeMembership = (g.memberships ?? [])[0];
                    return (
                      <tr key={g.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">
                            {g.lastName} {g.firstName}
                          </div>
                          {g.notes && (
                            <div className="text-xs text-slate-500">
                              {g.notes}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono text-xs font-semibold text-slate-700">
                          #{g.barcode}
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-600">
                          <div>{g.phone ?? '—'}</div>
                          <div className="text-slate-400">{g.email ?? ''}</div>
                        </td>
                        <td className="py-3 px-3 text-xs space-y-1">
                          {activeMembership && (
                            <div>
                              <span className="rounded bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 font-semibold text-indigo-700 dark:text-indigo-300">
                                Havi Köredzés Tagság:{' '}
                                {activeMembership.monthlyFeeHuf.toLocaleString(
                                  'hu-HU',
                                )}{' '}
                                Ft/hó ({activeMembership.status})
                              </span>
                            </div>
                          )}
                          {usablePasses.length > 0 ? (
                            usablePasses.map((p) => (
                              <div key={p.id} className="text-slate-600">
                                <span className="font-semibold text-slate-900">
                                  {p.passTemplateName}
                                </span>
                                :{' '}
                                {p.isFrozen
                                  ? 'FAGYASZTVA'
                                  : p.type === PassType.TIME_BASED
                                    ? 'Korlátlan'
                                    : `${p.calculatedRemainingPasses ?? p.remainingPasses} / ${p.totalPasses} alk.`}
                              </div>
                            ))
                          ) : (
                            <span className="text-rose-600 font-medium">
                              Nincs aktív bérlet
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="inline-flex flex-wrap justify-end items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setDigitalCardGuest(g)}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                            >
                              <QrCode className="h-3.5 w-3.5" />
                              Kártya
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDeductModalState({ isOpen: true, guest: g })
                              }
                              className="rounded-lg bg-teal-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-500"
                            >
                              Kezelés -1
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setSellModalState({
                                  isOpen: true,
                                  guest: g,
                                  preselectedTemplateId:
                                    usablePasses[0]?.passTemplateId,
                                })
                              }
                              className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                            >
                              + Bérlet
                            </button>
                            <button
                              type="button"
                              onClick={() => openGuestSheet(g)}
                              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
                            >
                              Adatlap
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'finance' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Pénzügy, Napi Kassza és Havi Tagdíj Tartozáskezelés (3. fejezet)
                </h2>
                <p className="text-xs text-slate-500">
                  Késési kategóriák (1–5 nap, 6–15 nap, 15+ nap), részbefizetések és napi kassza zárás.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setPaymentModalState({
                    isOpen: true,
                    guest: guestsQuery.data?.[0] ?? null,
                  })
                }
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-500"
              >
                <Wallet className="h-4 w-4" />
                + Új Befizetés / Tagdíj Elszámolás
              </button>
            </div>

            {/* Overdue Buckets Section (3.2) */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  Lejárt Havi Tagdíj Esedékességek Késési Kategóriák Szerint
                </h3>
                <div className="flex gap-2 text-xs font-bold">
                  <span className="rounded-lg bg-amber-100 px-2.5 py-1 text-amber-800">
                    1–5 nap késés: {overdueQuery.data?.buckets.DAYS_1_5.length ?? 0} fő
                  </span>
                  <span className="rounded-lg bg-orange-100 px-2.5 py-1 text-orange-800">
                    6–15 nap késés: {overdueQuery.data?.buckets.DAYS_6_15.length ?? 0} fő
                  </span>
                  <span className="rounded-lg bg-rose-100 px-2.5 py-1 text-rose-800">
                    15+ nap késés: {overdueQuery.data?.buckets.DAYS_OVER_15.length ?? 0} fő
                  </span>
                </div>
              </div>

              {(overdueQuery.data?.items ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">
                  Jelenleg nincs lejárt tagdíj-tartozás!
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                        <th className="py-2.5 px-3">Vendég</th>
                        <th className="py-2.5 px-3">Időszak & Esedékesség</th>
                        <th className="py-2.5 px-3">Késési Kategória</th>
                        <th className="py-2.5 px-3">Előírt / Fizetett</th>
                        <th className="py-2.5 px-3">Hátralék</th>
                        <th className="py-2.5 px-3 text-right">Művelet</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(overdueQuery.data?.items ?? []).map((item) => {
                        const g = (guestsQuery.data ?? []).find(
                          (x) => x.id === item.guestId,
                        );
                        return (
                          <tr key={item.dueId}>
                            <td className="py-2.5 px-3 font-bold">
                              {item.guestName}{' '}
                              <span className="font-mono text-xs text-slate-400">
                                #{item.guestBarcode}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-xs">
                              {item.period} (Esedékes:{' '}
                              {new Date(item.dueDate).toLocaleDateString(
                                'hu-HU',
                              )}
                              )
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                  item.overdueBucket ===
                                  OverdueBucket.DAYS_OVER_15
                                    ? 'bg-rose-100 text-rose-800'
                                    : item.overdueBucket ===
                                        OverdueBucket.DAYS_6_15
                                      ? 'bg-orange-100 text-orange-800'
                                      : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {item.overdueDays} nap késés (
                                {item.overdueBucket ===
                                OverdueBucket.DAYS_OVER_15
                                  ? '15+ nap'
                                  : item.overdueBucket ===
                                      OverdueBucket.DAYS_6_15
                                    ? '6–15 nap'
                                    : '1–5 nap'}
                                )
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-xs">
                              {item.amountHuf.toLocaleString('hu-HU')} Ft /{' '}
                              <span className="text-emerald-600 font-semibold">
                                {item.paidAmountHuf.toLocaleString('hu-HU')} Ft
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-extrabold text-rose-600">
                              {item.remainingHuf.toLocaleString('hu-HU')} Ft
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  setPaymentModalState({
                                    isOpen: true,
                                    guest: g ?? null,
                                    preselectedDueId: item.dueId,
                                  })
                                }
                                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
                              >
                                Befizetés Rögzítése
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/70 dark:bg-emerald-950/30 p-5">
                <span className="text-xs uppercase text-emerald-700 dark:text-emerald-400 font-bold">
                  Napi Összbevétel
                </span>
                <p className="mt-2 text-3xl font-black text-slate-900 dark:text-white">
                  {(financeQuery.data?.totalRevenue ?? 0).toLocaleString(
                    'hu-HU',
                  )}{' '}
                  Ft
                </p>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {financeQuery.data?.activeTransactionCount ?? 0} aktív tranzakció
                </span>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <span className="text-xs uppercase text-slate-500 font-bold">
                  Készpénz (Kassza)
                </span>
                <p className="mt-2 text-2xl font-extrabold text-slate-900">
                  {(financeQuery.data?.byMethod.CASH ?? 0).toLocaleString(
                    'hu-HU',
                  )}{' '}
                  Ft
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <span className="text-xs uppercase text-slate-500 font-bold">
                  Bankkártya (POS)
                </span>
                <p className="mt-2 text-2xl font-extrabold text-slate-900">
                  {(financeQuery.data?.byMethod.POS_CARD ?? 0).toLocaleString(
                    'hu-HU',
                  )}{' '}
                  Ft
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <span className="text-xs uppercase text-slate-500 font-bold">
                  Átutalás
                </span>
                <p className="mt-2 text-2xl font-extrabold text-slate-900">
                  {(
                    financeQuery.data?.byMethod.BANK_TRANSFER ?? 0
                  ).toLocaleString('hu-HU')}{' '}
                  Ft
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-base font-bold text-slate-900 mb-4">
                Napi Pénzügyi Tranzakciók és Sztornózás
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                      <th className="py-3 px-3">Időpont</th>
                      <th className="py-3 px-3">Vendég</th>
                      <th className="py-3 px-3">Bérlet / Megjegyzés</th>
                      <th className="py-3 px-3">Fizetési Mód</th>
                      <th className="py-3 px-3">Összeg</th>
                      <th className="py-3 px-3 text-right">Művelet</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(financeQuery.data?.payments ?? []).map((p) => (
                      <tr
                        key={p.id}
                        className={
                          p.isCancelled
                            ? 'bg-rose-50/40 line-through text-slate-400'
                            : ''
                        }
                      >
                        <td className="py-3 px-3 font-mono text-xs">
                          {new Date(p.createdAt).toLocaleTimeString('hu-HU', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-3 px-3 font-bold">{p.guestName}</td>
                        <td className="py-3 px-3 text-xs">
                          {p.passName ?? p.note}
                        </td>
                        <td className="py-3 px-3 text-xs">
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                            <CreditCard className="h-3 w-3" />
                            {p.paymentMethod === PaymentMethod.CASH
                              ? 'Készpénz'
                              : p.paymentMethod === PaymentMethod.POS_CARD
                                ? 'Bankkártya'
                                : 'Átutalás'}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-bold">
                          {p.amount.toLocaleString('hu-HU')} Ft
                        </td>
                        <td className="py-3 px-3 text-right">
                          {!p.isCancelled ? (
                            <button
                              type="button"
                              onClick={() =>
                                cancelPaymentMutation.mutate({
                                  paymentId: p.id,
                                  reason: 'Recepciós kassza sztornó',
                                })
                              }
                              className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                            >
                              Fizetés Sztornó
                            </button>
                          ) : (
                            <span className="text-xs font-bold text-rose-600">
                              SZTORNÓZVA
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'admin' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Services CRUD */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-slate-900">
                Szolgáltatások & Kezelések Törzsadatok (Service)
              </h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newServiceName.trim()) return;
                  createServiceMutation.mutate({
                    name: newServiceName,
                    category: newServiceCat,
                    durationMinutes: newServiceDuration,
                    priceHuf: newServicePrice,
                  });
                }}
                className="grid grid-cols-1 gap-3 sm:grid-cols-2 rounded-xl bg-slate-50 p-4 border border-slate-200"
              >
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Szolgáltatás megnevezése
                  </label>
                  <input
                    type="text"
                    required
                    value={newServiceName}
                    onChange={(e) => setNewServiceName(e.target.value)}
                    placeholder="Pl. Hypoxi Dermology / Wiener Testtekercselés"
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Kategória
                  </label>
                  <select
                    value={newServiceCat}
                    onChange={(e) =>
                      setNewServiceCat(e.target.value as ServiceCategory)
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                  >
                    <option value={ServiceCategory.BODY_SHAPING}>
                      Alakformáló Kezelés (BODY_SHAPING)
                    </option>
                    <option value={ServiceCategory.COSMETIC}>
                      Kozmetikai Kezelés (COSMETIC)
                    </option>
                    <option value={ServiceCategory.CIRCUIT}>
                      Női Köredzés (CIRCUIT)
                    </option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Időtartam (perc)
                  </label>
                  <input
                    type="number"
                    min={5}
                    value={newServiceDuration}
                    onChange={(e) =>
                      setNewServiceDuration(Number(e.target.value))
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Listaár (Ft)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newServicePrice}
                    onChange={(e) => setNewServicePrice(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                  />
                </div>
                <div className="flex items-end justify-end">
                  <button
                    type="submit"
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                  >
                    + Szolgáltatás Hozzáadása
                  </button>
                </div>
              </form>

              <div className="divide-y divide-slate-100">
                {(servicesQuery.data ?? []).map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between py-2.5 text-sm"
                  >
                    <div>
                      <span className="font-bold text-slate-900">{s.name}</span>
                      <p className="text-xs text-slate-500">
                        {s.category === ServiceCategory.CIRCUIT
                          ? 'Női Köredzés'
                          : s.category === ServiceCategory.COSMETIC
                            ? 'Kozmetikai Kezelés'
                            : 'Alakformáló Kezelés'}{' '}
                        • {s.durationMinutes} perc
                      </p>
                    </div>
                    <span className="font-bold text-emerald-700">
                      {s.priceHuf.toLocaleString('hu-HU')} Ft
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Pass Templates CRUD */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-slate-900">
                Bérletsablonok Kezelése (Admin)
              </h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newTplName.trim()) return;
                  createTemplateMutation.mutate({
                    name: newTplName,
                    type: newTplType,
                    totalPasses:
                      newTplType === PassType.OCCASION_BASED
                        ? newTplPasses
                        : null,
                    durationDays: newTplDays,
                    price: newTplPrice,
                  });
                }}
                className="grid grid-cols-1 gap-3 sm:grid-cols-2 rounded-xl bg-slate-50 p-4 border border-slate-200"
              >
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Bérlet megnevezése
                  </label>
                  <input
                    type="text"
                    required
                    value={newTplName}
                    onChange={(e) => setNewTplName(e.target.value)}
                    placeholder="Pl. 10 Alkalmas Hypoxi Bérlet"
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Típus
                  </label>
                  <select
                    value={newTplType}
                    onChange={(e) => setNewTplType(e.target.value as PassType)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                  >
                    <option value={PassType.OCCASION_BASED}>
                      Alkalom alapú (OCCASION_BASED)
                    </option>
                    <option value={PassType.TIME_BASED}>
                      Időkorlátos korlátlan (TIME_BASED)
                    </option>
                  </select>
                </div>
                {newTplType === PassType.OCCASION_BASED && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Alkalmak száma
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={newTplPasses}
                      onChange={(e) => setNewTplPasses(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Érvényesség (nap)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={newTplDays}
                    onChange={(e) => setNewTplDays(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Ár (Ft)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={newTplPrice}
                    onChange={(e) => setNewTplPrice(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                  />
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <button
                    type="submit"
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                  >
                    + Bérletsablon Hozzáadása
                  </button>
                </div>
              </form>

              <div className="divide-y divide-slate-100">
                {(templatesQuery.data ?? []).map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between py-2.5 text-sm"
                  >
                    <div>
                      <span className="font-bold text-slate-900">{t.name}</span>
                      <p className="text-xs text-slate-500">
                        {t.type === PassType.TIME_BASED
                          ? 'Korlátlan'
                          : `${t.totalPasses} alkalom`}{' '}
                        • {t.durationDays} nap
                      </p>
                    </div>
                    <span className="font-bold text-emerald-700">
                      {t.price.toLocaleString('hu-HU')} Ft
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Dual-Mode Monitor, Greeting Duration Config & Tablet Pairing */}
            <div className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-5 transition-colors">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Vendégmonitorok & Önálló Tablet Párosítás
                  </h3>
                  <span className="rounded-full bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                    Dual-Mode Szinkron
                  </span>
                </div>

                <div className="flex items-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 px-3.5 py-2 text-xs">
                  <Clock className="h-4 w-4 text-emerald-600" />
                  <span className="font-semibold">
                    Üdvözlő üzenet megjelenítési ideje:
                  </span>
                  <input
                    type="number"
                    min={3}
                    max={30}
                    value={greetingSeconds}
                    onChange={(e) => {
                      const val = mockStudioEngine.setMonitorGreetingSeconds(
                        Number(e.target.value),
                      );
                      setGreetingSeconds(val);
                      notify.info(
                        `Vendégmonitor üdvözlési idő: ${val} másodperc`,
                      );
                    }}
                    className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-center font-bold"
                  />
                  <span>mp (alapértelmezett: 5–8 mp)</span>
                </div>
              </div>

              {/* 1. Üzemmód: Azonos PC — Másodlagos Monitor (Bejelentkezett gépen kód nélkül) */}
              <div className="rounded-2xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/10 p-4 space-y-3 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                      1. Üzemmód • Ez a PC (Kód nem szükséges)
                    </span>
                    <h4 className="mt-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
                      Másodlagos Monitor ugyanazon a gépen
                    </h4>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      Mivel ezen a gépen be vagy jelentkezve, a{' '}
                      <code className="rounded bg-emerald-100/80 dark:bg-slate-800 px-1.5 py-0.5 font-mono font-bold text-slate-800 dark:text-emerald-300">
                        /monitor
                      </code>{' '}
                      oldal <strong>párosító kód megadása nélkül azonnal működik</strong>.
                      Nyisd meg új ablakban, húzd át a vendég felé néző kijelzőre,
                      és nyomj Teljes Képernyőt!
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={openSecondaryMonitorWindow}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 dark:bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 dark:hover:bg-emerald-500 transition-colors"
                  >
                    <Monitor className="h-3.5 w-3.5 text-emerald-400 dark:text-white" />
                    Vendégmonitor Megnyitása Új Ablakban
                    <ExternalLink className="h-3 w-3 text-slate-400 dark:text-emerald-100" />
                  </button>

                  <button
                    type="button"
                    disabled={testSignalMutation.isPending}
                    onClick={() => testSignalMutation.mutate(undefined)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 dark:border-emerald-500/40 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-bold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
                  >
                    <Radio className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    Teszt Jel Küldése a Kijelzőkre
                  </button>
                </div>
              </div>

              {/* 2. Üzemmód: Különálló Tablet / iPad / TV (Nem bejelentkezett eszközön 6 jegyű kóddal) */}
              <div className="space-y-3 pt-1">
                <div>
                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-800 dark:bg-slate-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-200">
                    2. Üzemmód • Különálló Eszköz (Tablet / iPad / Smart TV)
                  </span>
                  <h4 className="mt-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
                    Önálló kijelző párosítása 6 jegyű kóddal
                  </h4>
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    Ha egy különálló tabletről (ahol nem vagy bejelentkezve)
                    nyitod meg a{' '}
                    <code className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono font-bold text-slate-800 dark:text-emerald-300">
                      /monitor
                    </code>{' '}
                    oldalt, a képernyő zárolva lesz, amíg be nem ütöd az itt
                    generált 6 jegyű kódot. A kód <strong>10 percig érvényes</strong>,
                    és a párosítás bármikor megszakítható.
                  </p>
                </div>

                {(() => {
                  const trimmedCandidate = newDeviceName.trim();
                  const duplicateDevice = (devicesQuery.data ?? []).find(
                    (d) =>
                      trimmedCandidate.length > 0 &&
                      d.name.trim().toLowerCase() ===
                        trimmedCandidate.toLowerCase(),
                  );

                  return (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!trimmedCandidate) {
                          notify.warning(
                            'Hiányzó eszköznév',
                            'Kérjük, adj nevet a párosítandó kijelzőnek!',
                          );
                          return;
                        }
                        if (duplicateDevice) {
                          notify.error(
                            'Ez a kijelzőnév már foglalt!',
                            `Már létezik "${duplicateDevice.name}" nevű monitor. Ugyanolyan nevű monitort nem lehet kétszer létrehozni!`,
                          );
                          return;
                        }
                        initPairingMutation.mutate(trimmedCandidate);
                      }}
                      className="space-y-1.5"
                    >
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={newDeviceName}
                          onChange={(e) => setNewDeviceName(e.target.value)}
                          placeholder="Egyedi eszköz neve (pl. Pult iPad #1)"
                          className={`flex-1 rounded-xl border px-3.5 py-2 text-sm bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none transition-colors ${
                            duplicateDevice
                              ? 'border-rose-400 dark:border-rose-500/60 bg-rose-50/40 dark:bg-rose-500/10 focus:border-rose-500'
                              : 'border-slate-200 dark:border-slate-700 focus:border-emerald-500'
                          }`}
                        />
                        <button
                          type="submit"
                          disabled={
                            initPairingMutation.isPending ||
                            !trimmedCandidate ||
                            Boolean(duplicateDevice)
                          }
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          6 Jegyű Párosító Kód Generálása
                        </button>
                      </div>
                      {duplicateDevice && (
                        <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          Már létezik „{duplicateDevice.name}” nevű kijelző! Adj
                          meg másik nevet, vagy kezeld a meglévőt alább.
                        </p>
                      )}
                    </form>
                  );
                })()}

                {/* Eszközök listája */}
                {(devicesQuery.data ?? []).length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                    Jelenleg nincs különálló párosított tablet vagy folyamatban
                    lévő párosító kód.
                  </div>
                ) : (
                  <div className="space-y-2.5 pt-1">
                    {(devicesQuery.data ?? []).map((dev) => {
                      const expiresMs = dev.pairingExpiresAt
                        ? new Date(dev.pairingExpiresAt).getTime()
                        : null;
                      const remainingSec =
                        dev.pairingCode && expiresMs
                          ? Math.max(
                              0,
                              Math.floor((expiresMs - nowTick) / 1000),
                            )
                          : null;
                      const isExpired =
                        Boolean(dev.pairingCode) &&
                        (dev.status === 'EXPIRED' ||
                          (remainingSec !== null && remainingSec <= 0));
                      const isPending =
                        Boolean(dev.pairingCode) && !isExpired;
                      const isPaired = !dev.pairingCode;

                      const minutesLeft =
                        remainingSec !== null
                          ? String(Math.floor(remainingSec / 60)).padStart(
                              2,
                              '0',
                            )
                          : '00';
                      const secondsLeft =
                        remainingSec !== null
                          ? String(remainingSec % 60).padStart(2, '0')
                          : '00';

                      const isEditing = editingDeviceId === dev.id;

                      return (
                        <div
                          key={dev.id}
                          className={`rounded-xl border p-3.5 text-xs transition-colors ${
                            isPaired
                              ? 'border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60'
                              : isPending
                                ? 'border-amber-300 dark:border-amber-500/40 bg-amber-50/50 dark:bg-amber-500/10'
                                : 'border-rose-200 dark:border-rose-500/40 bg-rose-50/40 dark:bg-rose-500/10'
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="space-y-1 flex-1 min-w-[200px]">
                              {isEditing ? (
                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    const trimmed = editingDeviceName.trim();
                                    if (!trimmed) return;
                                    renameDeviceMutation.mutate({
                                      deviceId: dev.id,
                                      name: trimmed,
                                    });
                                  }}
                                  className="flex items-center gap-1.5"
                                >
                                  <input
                                    type="text"
                                    value={editingDeviceName}
                                    onChange={(e) =>
                                      setEditingDeviceName(e.target.value)
                                    }
                                    autoFocus
                                    className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950 px-2.5 py-1 text-xs font-bold text-slate-900 dark:text-slate-100"
                                  />
                                  <button
                                    type="submit"
                                    disabled={renameDeviceMutation.isPending}
                                    className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-500"
                                  >
                                    Mentés
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingDeviceId(null);
                                      setEditingDeviceName('');
                                    }}
                                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                                  >
                                    Mégse
                                  </button>
                                </form>
                              ) : (
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                                    {dev.name}
                                  </span>
                                  {isPaired && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-500/20 border border-transparent dark:border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                                      <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                                      Párosítva & Aktív
                                    </span>
                                  )}
                                  {isPending && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-500/20 border border-transparent dark:border-amber-500/30 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-300">
                                      <Clock className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                                      Párosításra vár ({minutesLeft}:
                                      {secondsLeft})
                                    </span>
                                  )}
                                  {isExpired && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 dark:bg-rose-500/20 border border-transparent dark:border-rose-500/30 px-2.5 py-0.5 text-[11px] font-bold text-rose-800 dark:text-rose-300">
                                      <XCircle className="h-3 w-3 text-rose-600 dark:text-rose-400" />
                                      Kód lejárt
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Egyértelmű aktivitás magyarázat */}
                              {isPaired ? (
                                <div className="space-y-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                                  {dev.pairedAt && (
                                    <p>
                                      Párosítva:{' '}
                                      <span className="font-medium text-slate-800 dark:text-slate-200">
                                        {new Date(dev.pairedAt).toLocaleString(
                                          'hu-HU',
                                        )}
                                      </span>
                                    </p>
                                  )}
                                  <p>
                                    Utolsó aktivitás:{' '}
                                    {dev.lastSeenAt ? (
                                      <>
                                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                                          {new Date(
                                            dev.lastSeenAt,
                                          ).toLocaleString('hu-HU')}
                                        </span>{' '}
                                        —{' '}
                                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                          {dev.lastActivityType ??
                                            'Sikeresen párosítva'}
                                        </span>
                                      </>
                                    ) : (
                                      <span className="italic text-slate-400 dark:text-slate-500">
                                        Még nem volt esemény
                                      </span>
                                    )}
                                  </p>
                                </div>
                              ) : isPending ? (
                                <p className="text-[11px] text-amber-900 dark:text-amber-300">
                                  Még nincs párosítva • Nyisd meg a másik eszközön
                                  a{' '}
                                  <code className="rounded bg-amber-100/80 dark:bg-slate-800 px-1 py-0.5 font-mono font-bold text-amber-950 dark:text-amber-200">
                                    /monitor
                                  </code>{' '}
                                  oldalt, és üsd be a 6 jegyű kódot!
                                </p>
                              ) : (
                                <p className="text-[11px] text-rose-700 dark:text-rose-300">
                                  A 6 jegyű párosító kód 10 perc után lejárt.
                                  Kérhetsz új kódot, vagy törölheted a bejegyzést.
                                </p>
                              )}
                            </div>

                            {isPending && dev.pairingCode && (
                              <div className="rounded-xl bg-amber-100/90 dark:bg-amber-500/20 border border-amber-300 dark:border-amber-500/40 px-3.5 py-2 text-center shadow-sm">
                                <span className="block text-[10px] uppercase text-amber-800 dark:text-amber-300 font-bold">
                                  6 jegyű párosító kód
                                </span>
                                <span className="font-mono text-lg font-black tracking-[0.25em] text-amber-950 dark:text-amber-100">
                                  {dev.pairingCode}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Menedzsment gombok */}
                          <div className="mt-3 flex flex-wrap items-center justify-end gap-1.5 border-t border-slate-200/80 dark:border-slate-700/80 pt-2.5">
                            {isPaired && (
                              <button
                                type="button"
                                disabled={testSignalMutation.isPending}
                                onClick={() =>
                                  testSignalMutation.mutate(dev.id)
                                }
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 dark:border-emerald-500/40 bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/20 transition-colors"
                                title="Teszt felvillantás küldése erre a kijelzőre"
                              >
                                <Radio className="h-3 w-3" />
                                Teszt jel
                              </button>
                            )}

                            {!isEditing && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingDeviceId(dev.id);
                                  setEditingDeviceName(dev.name);
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              >
                                <Edit3 className="h-3 w-3" />
                                Átnevezés
                              </button>
                            )}

                            <button
                              type="button"
                              disabled={regenerateCodeMutation.isPending}
                              onClick={() =>
                                regenerateCodeMutation.mutate(dev.id)
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-amber-300 dark:border-amber-500/40 bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-500/20 transition-colors"
                              title={
                                isPaired
                                  ? 'Jelenlegi párosítás bontása és új 6 jegyű kód kérése'
                                  : 'Új 6 jegyű párosító kód generálása (10 perc)'
                              }
                            >
                              <RefreshCw className="h-3 w-3" />
                              {isPaired
                                ? 'Párosítás bontása / Új kód'
                                : 'Új kód kérése'}
                            </button>

                            <button
                              type="button"
                              disabled={deleteDeviceMutation.isPending}
                              onClick={() => deleteDeviceMutation.mutate(dev.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/15 px-2.5 py-1 text-[11px] font-bold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-500/25 transition-colors"
                            >
                              <Trash2 className="h-3 w-3" />
                              {isPending
                                ? 'Párosítás megszakítása'
                                : 'Törlés'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'news' && (
          <WhatsNewPanel onOpenReceptionTab={handleSelectMainTab} />
        )}
        </>
        )}
      </main>

      {/* Modals */}
      <DeductTreatmentModal
        isOpen={deductModalState.isOpen}
        initialGuest={deductModalState.guest}
        guests={guestsQuery.data ?? []}
        services={servicesQuery.data ?? []}
        isSubmitting={deductTreatmentMutation.isPending}
        onClose={() => setDeductModalState({ isOpen: false, guest: null })}
        onConfirmDeduct={(data) => deductTreatmentMutation.mutate(data)}
        onOpenSellPass={(guest) =>
          setSellModalState({ isOpen: true, guest })
        }
      />

      <RecordPaymentModal
        isOpen={paymentModalState.isOpen}
        initialGuest={paymentModalState.guest}
        guests={guestsQuery.data ?? []}
        preselectedDueId={paymentModalState.preselectedDueId}
        isSubmitting={recordPaymentMutation.isPending}
        onClose={() => setPaymentModalState({ isOpen: false, guest: null })}
        onConfirmPayment={(data) => recordPaymentMutation.mutate(data)}
      />

      <SellPassModal
        isOpen={sellModalState.isOpen}
        guest={sellModalState.guest}
        templates={templatesQuery.data ?? []}
        preselectedTemplateId={sellModalState.preselectedTemplateId}
        isSubmitting={sellPassMutation.isPending}
        onClose={() => setSellModalState({ isOpen: false, guest: null })}
        onConfirmSell={(data) => sellPassMutation.mutate(data)}
      />

      <DigitalPassCardModal
        guest={digitalCardGuest}
        onClose={() => setDigitalCardGuest(null)}
      />
    </div>
  );
};
