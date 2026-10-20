import {
  CheckInResultPayload,
  CheckInStatus,
  GuestDto,
  PassType,
  PaymentMethod,
} from '@reform/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Barcode,
  CheckCircle2,
  Clock,
  CloudOff,
  CreditCard,
  Edit3,
  ExternalLink,
  FlaskConical,
  KeyRound,
  LogOut,
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
  Users,
  Volume2,
  VolumeX,
  Wallet,
  XCircle,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ThemeToggleButton } from '../../components/ThemeToggleButton';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { useMonitorChannel } from '../../hooks/useMonitorChannel';
import { api } from '../../lib/api';
import { notify } from '../../lib/notify';
import { soundFeedback } from '../../lib/sound';
import { useAuthStore } from '../../stores/authStore';
import { useOfflineQueueStore } from '../../stores/offlineQueueStore';
import { useThemeStore } from '../../stores/themeStore';
import { DigitalPassCardModal } from '../guests/DigitalPassCardModal';
import { GuestModal } from '../guests/GuestModal';
import { SellPassModal } from './SellPassModal';

type ActiveTab = 'desk' | 'guests' | 'finance' | 'admin';

export const ReceptionPage: React.FC = () => {
  const navigate = useNavigate();
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
  const [manualBarcode, setManualBarcode] = useState('');
  const [guestSearch, setGuestSearch] = useState('');
  const [lastCheckIn, setLastCheckIn] = useState<CheckInResultPayload | null>(
    null,
  );
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Modals
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

  const { isConnected, connectedDisplays } = useMonitorChannel();

  // Queries
  const guestsQuery = useQuery({
    queryKey: ['guests', guestSearch],
    queryFn: () => api.getGuests(guestSearch),
  });

  const templatesQuery = useQuery({
    queryKey: ['pass-templates'],
    queryFn: () => api.getPassTemplates(true),
  });

  const todayCheckInsQuery = useQuery({
    queryKey: ['today-checkins'],
    queryFn: () => api.getTodayCheckIns(),
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
    queryClient.invalidateQueries({ queryKey: ['today-checkins'] });
    queryClient.invalidateQueries({ queryKey: ['daily-finance'] });
    queryClient.invalidateQueries({ queryKey: ['pass-templates'] });
    queryClient.invalidateQueries({ queryKey: ['display-devices'] });
  }, [queryClient]);

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
      setLastCheckIn(null);
      refreshAll();
    },
  });

  const scanMutation = useMutation({
    mutationFn: (vars: { barcode: string; forceDuplicate?: boolean }) =>
      api.scanCheckIn(vars),
    onSuccess: (res) => {
      setLastCheckIn(res);
      notify.checkInResult(res, {
        onRevoke: (checkInId) => revokeMutation.mutate(checkInId),
        onForceDuplicate: (barcode) =>
          scanMutation.mutate({ barcode, forceDuplicate: true }),
        onOpenSellModal: (guestId, suggestedTemplateId) =>
          openSellModalByGuestId(guestId, suggestedTemplateId),
      });
      refreshAll();
    },
  });

  const handleBarcodeScan = useCallback(
    (barcode: string) => {
      const code = barcode.trim();
      if (!code) return;

      if (!isOnline) {
        const queued = enqueueScan(code);
        notify.warning(
          `Offline mód: Vonalkód várólistára mentve (${queued.barcode})`,
          'Az internetkapcsolat helyreállásakor automatikusan szinkronizálódik.',
        );
        return;
      }

      scanMutation.mutate({ barcode: code });
    },
    [isOnline, enqueueScan, scanMutation],
  );

  // Global physical USB/Bluetooth barcode scanner hook
  useBarcodeScanner({
    onScan: handleBarcodeScan,
    enabled: true,
  });

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
      notify.error('Offline szinkronizáció sikertelen', (err as Error).message);
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
      setGuestModalState({ isOpen: false, guest: null });
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
        `${cancelled.amount.toLocaleString('hu-HU')} Ft levonva a napi kasszából, a bérlet deaktiválva.`,
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
      notify.error('Nem sikerült kódot generálni', (err as Error).message);
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
      notify.error('Kód újragenerálása sikertelen', (err as Error).message);
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
      notify.error('Átnevezés sikertelen', (err as Error).message);
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
      notify.error('Törlés sikertelen', (err as Error).message);
    },
  });

  const testSignalMutation = useMutation({
    mutationFn: (deviceId?: string) => api.sendMonitorTestSignal(deviceId),
    onSuccess: (res) => {
      notify.success('Teszt jel elküldve!', res.message);
      refreshAll();
    },
    onError: (err) => {
      notify.error('Teszt jel küldése sikertelen', (err as Error).message);
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

  return (
    <div
      className={`min-h-screen bg-slate-50 flex flex-col transition-colors duration-200 ${
        theme === 'dark' ? 'reception-theme-dark dark' : ''
      }`}
    >
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-slate-900 text-white shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-500/30">
              <Sparkles className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold tracking-tight">
                  ReformStudioSync
                </h1>
                <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
                  Recepció v1.0
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Bejelentkezve: {user?.name ?? 'Recepciós Munkatárs'}
              </p>
            </div>
          </div>

          {/* Center Tabs */}
          <nav className="flex items-center gap-1 rounded-xl bg-slate-800 p-1">
            {[
              { id: 'desk', label: 'Recepciós Pult', icon: Barcode },
              { id: 'guests', label: 'Vendégkartoték', icon: Users },
              { id: 'finance', label: 'Napi Kassza', icon: Wallet },
              { id: 'admin', label: 'Sablonok & Monitorok', icon: Settings },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as ActiveTab)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    active
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Right Status & Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOnline(!isOnline)}
              title="Kattints az Offline / Online mód szimulálásához"
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold border transition-all ${
                isOnline
                  ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                  : 'border-amber-500/40 bg-amber-500/20 text-amber-300'
              }`}
            >
              {isOnline ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
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
              className="rounded-xl border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:text-white"
              title="Hangjelzés ki/bekapcsolása"
            >
              {soundEnabled ? (
                <Volume2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <VolumeX className="h-4 w-4 text-slate-500" />
              )}
            </button>

            <ThemeToggleButton />

            <button
              type="button"
              onClick={openSecondaryMonitorWindow}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
            >
              <Monitor className="h-3.5 w-3.5 text-emerald-400" />
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
      <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
        {activeTab === 'desk' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left Column: Scanner Bar & Last Check-In Card */}
            <div className="lg:col-span-7 space-y-6">
              {/* Barcode Scanner Input Box */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Barcode className="h-5 w-5 text-emerald-600" />
                    <h2 className="text-base font-bold text-slate-900">
                      Gyors Vonalkódos Beléptetés
                    </h2>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                    USB/HID Scanner Aktív (Fókuszfüggetlen)
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
                    value={manualBarcode}
                    onChange={(e) => setManualBarcode(e.target.value)}
                    placeholder="Csippantsd le a kártyát bárhol, vagy írd be a kódot (pl. 100001)..."
                    className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-mono focus:border-emerald-600 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-500"
                  >
                    Beléptetés
                  </button>
                </form>

                {/* Quick Scan Pills */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-slate-400 mr-1">Gyors tesztkódok:</span>
                  {[
                    { code: '100001', label: 'Kovács Anna (Érvényes)' },
                    { code: '100002', label: 'Nagy Péter (Utolsó 1 alk.)' },
                    { code: '100003', label: 'Szabó Eszter (Korlátlan)' },
                    { code: '100004', label: 'Tóth Gábor (Lejárt)' },
                    { code: '100006', label: 'Horváth Dóra (Fagyasztott)' },
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

              {/* Last Check-In Result Card with 1-Click Sztornó & 1-Click Renewal */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                    Utolsó Beléptetés Állapota & Műveletek
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
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-12 text-center">
                    <Ticket className="h-10 w-10 text-slate-300 mb-2" />
                    <p className="text-sm font-medium text-slate-600">
                      Még nem történt beléptetés ebben a munkamenetben.
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
                          <div className="flex items-center gap-2">
                            <h4 className="text-xl font-extrabold text-slate-900">
                              {lastCheckIn.guestName}
                            </h4>
                            <span className="rounded-md bg-white px-2 py-0.5 font-mono text-xs text-slate-600 border border-slate-200">
                              #{lastCheckIn.barcode}
                            </span>
                          </div>
                          <p className="mt-1 text-sm font-medium text-slate-700">
                            {lastCheckIn.passName ??
                              lastCheckIn.reason ??
                              'Nincs aktív bérlet'}
                          </p>
                          {(lastCheckIn.status === CheckInStatus.SUCCESS ||
                            lastCheckIn.status ===
                              CheckInStatus.DUPLICATE_SCAN) && (
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
                              Beléptetés Sztornó (+1 vissza)
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
                            Mégis levonás (+1 vendég)
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
                            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-500"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            {lastCheckIn.warnings?.length ||
                            lastCheckIn.status === CheckInStatus.DENIED
                              ? 'Bérlet Megújítása 1 Kattintással'
                              : 'Új Bérlet Eladása'}
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
                    Vendég Gyorskereső (Ha otthon maradt a kártya)
                  </h3>
                  <button
                    type="button"
                    onClick={() =>
                      setGuestModalState({ isOpen: true, guest: null })
                    }
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

                <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                  {(guestsQuery.data ?? []).map((g) => {
                    const activePass = (g.passes ?? []).find(
                      (p) =>
                        p.isActive &&
                        !p.isFrozen &&
                        new Date(p.expirationDate) >= new Date(),
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
                            <span className="font-bold text-sm text-slate-900">
                              {g.lastName} {g.firstName}
                            </span>
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

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleBarcodeScan(g.barcode)}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500"
                          >
                            Beléptetés
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setSellModalState({
                                isOpen: true,
                                guest: g,
                                preselectedTemplateId:
                                  activePass?.passTemplateId,
                              })
                            }
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Bérlet Eladás
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
                    onClick={() => setActiveTab('finance')}
                    className="text-xs text-slate-300 underline hover:text-white"
                  >
                    Részletes zárás →
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

              {/* Today's Check-In Log */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 mb-3">
                  Mai Beléptetési Napló ({todayCheckInsQuery.data?.length ?? 0})
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
                        </div>
                        <p className="text-slate-500 mt-0.5">
                          {log.status === CheckInStatus.CANCELLED
                            ? 'SZTORNÓZVA (Alkalom visszaírva)'
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
                            title="Beléptetés visszavonása (Sztornó)"
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
        )}

        {activeTab === 'guests' && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Vendégkartoték, Digitális Kártyák és Bérlet Hosszabbítás / Fagyasztás
                </h2>
                <p className="text-xs text-slate-500">
                  Kattints a "Kartoték & Hosszabbítás" gombra egyedi bérlet +N napos hosszabbításához vagy fagyasztásához.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setGuestModalState({ isOpen: true, guest: null })
                }
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
                    <th className="py-3 px-3">Kártya / Vonalkód</th>
                    <th className="py-3 px-3">Elérhetőség</th>
                    <th className="py-3 px-3">Aktuális Bérlet Státusz</th>
                    <th className="py-3 px-3 text-right">Műveletek</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(guestsQuery.data ?? []).map((g) => {
                    const latestPass = (g.passes ?? [])[0];
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
                          {g.barcode}
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-600">
                          <div>{g.phone ?? '—'}</div>
                          <div className="text-slate-400">{g.email ?? ''}</div>
                        </td>
                        <td className="py-3 px-3 text-xs">
                          {latestPass ? (
                            <div>
                              <span className="font-semibold text-slate-900">
                                {latestPass.passTemplateName}
                              </span>
                              <div className="text-slate-500">
                                {latestPass.isFrozen ? (
                                  <span className="text-sky-700 font-bold">
                                    FAGYASZTVA
                                  </span>
                                ) : latestPass.type === PassType.TIME_BASED ? (
                                  'Korlátlan'
                                ) : (
                                  `${latestPass.remainingPasses} / ${latestPass.totalPasses} alkalom`
                                )}{' '}
                                • Lejár:{' '}
                                {new Date(
                                  latestPass.expirationDate,
                                ).toLocaleDateString('hu-HU')}
                              </div>
                            </div>
                          ) : (
                            <span className="text-rose-600 font-medium">
                              Nincs bérlet
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setDigitalCardGuest(g)}
                              className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                            >
                              <QrCode className="h-3.5 w-3.5" />
                              Digitális Kártya
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setSellModalState({
                                  isOpen: true,
                                  guest: g,
                                  preselectedTemplateId:
                                    latestPass?.passTemplateId,
                                })
                              }
                              className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                            >
                              + Bérlet
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setGuestModalState({ isOpen: true, guest: g })
                              }
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              Kartoték & Hosszabbítás
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-900 p-5 text-white">
                <span className="text-xs uppercase text-emerald-400 font-bold">
                  Napi Összbevétel
                </span>
                <p className="mt-2 text-3xl font-black">
                  {(financeQuery.data?.totalRevenue ?? 0).toLocaleString(
                    'hu-HU',
                  )}{' '}
                  Ft
                </p>
                <span className="text-xs text-slate-400">
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
                          p.isCancelled ? 'bg-rose-50/40 line-through text-slate-400' : ''
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
                    placeholder="Pl. 20 Alkalmas Reformer Bérlet"
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
                    className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
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

            {/* Dual-Mode Monitor & Tablet Pairing */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-5 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Vendégmonitorok & Önálló Tablet Párosítás
                  </h3>
                </div>
                <span className="rounded-full bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                  Dual-Mode Szinkron
                </span>
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
      </main>

      {/* Modals */}
      <SellPassModal
        isOpen={sellModalState.isOpen}
        guest={sellModalState.guest}
        templates={templatesQuery.data ?? []}
        preselectedTemplateId={sellModalState.preselectedTemplateId}
        isSubmitting={sellPassMutation.isPending}
        onClose={() => setSellModalState({ isOpen: false, guest: null })}
        onConfirmSell={(data) => sellPassMutation.mutate(data)}
      />

      <GuestModal
        isOpen={guestModalState.isOpen}
        guest={guestModalState.guest}
        onClose={() => setGuestModalState({ isOpen: false, guest: null })}
        onSaveGuest={(data) => saveGuestMutation.mutate(data)}
        onExtendPass={(passId, additionalDays, note) =>
          extendPassMutation.mutate({ passId, additionalDays, note })
        }
        onToggleFreezePass={(passId, note) =>
          toggleFreezeMutation.mutate({ passId, note })
        }
        onOpenDigitalCard={(g) => setDigitalCardGuest(g)}
      />

      <DigitalPassCardModal
        guest={digitalCardGuest}
        onClose={() => setDigitalCardGuest(null)}
      />
    </div>
  );
};
