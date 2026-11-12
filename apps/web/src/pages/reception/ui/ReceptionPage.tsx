import {
  CheckInResultPayload,
  CheckInStatus,
  Gender,
  GuestDto,
  TreatmentSelectionOption,
  VisitType,
} from '@reform/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { normalizeScannedCode } from '@/shared/lib/barcode-scanner';
import {
  broadcastToScannerChannel,
  useMonitorChannel,
} from '@/shared/lib/monitor-channel';
import { api } from '@/shared/api';
import { handleAppError } from '@/shared/lib/errors';
import { notify } from '@/shared/lib/notify';
import { useOfflineQueueStore } from '@/entities/check-in';
import { useScannerChannelStore } from '@/entities/check-in';
import { DISPLAY_DEVICES_QUERY_KEY } from '@/entities/display-device';
import { DigitalPassCardModal } from '@/entities/guest';
import { AppHeaderStatus } from '@/widgets/app-shell';
import { GuestModal } from '@/widgets/guest-profile';
import {
  DeductTreatmentModal,
  getTreatmentPreselection,
} from '@/features/deduct-treatment';
import { RecordPaymentModal } from '@/features/record-payment';
import { SellPassModal } from '@/features/sell-pass';
import {
  getReceptionTab,
  RECEPTION_TAB_ROUTES,
  type ReceptionTab,
} from '../model/receptionTabs';
import { ReceptionDeskTab } from './desk/ReceptionDeskTab';
import { OfflineQueueNotice } from './desk/OfflineQueueNotice';
import { ReceptionHeaderStatus } from './desk/ReceptionHeaderStatus';
import { GuestsTab } from './guests/GuestsTab';
import { FinanceTab } from './finance/FinanceTab';
import { PassesTab } from './passes/PassesTab';
import { WhatsNewPanel } from './WhatsNewPanel';

// Offline tételek, amelyeknél nem rögzült belépés, mert kezelést kell választani (TICKET-39).
const notifyOfflineTreatmentSelections = (results: CheckInResultPayload[]) => {
  const pending = results.filter(
    (r) => r.status === CheckInStatus.TREATMENT_SELECTION_REQUIRED,
  );
  if (pending.length === 0) return;
  notify.warning(
    `Kezelésválasztás kell (${pending.length} offline beolvasás)`,
    `Nem rögzült belépés: ${pending.map((r) => r.guestName).join(', ')}. A kezelést a „Kezelés -1” gombbal vond le.`,
  );
};

export const ReceptionPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const {
    queue: offlineQueue,
    isOnline,
    setOnline,
    enqueueScan,
    clearQueue,
  } = useOfflineQueueStore();

  // A fül az útvonalból jön (/reception, /guests, /passes, /finance, /news).
  const activeTab = getReceptionTab(location.pathname);
  const [guestSearch, setGuestSearch] = useState('');
  const {
    isListening: isScannerListening,
    setListening: setScannerListening,
    lastScannedCode,
    lastCheckInResult: lastCheckIn,
    recordCheckInResult: setLastCheckIn,
    recordRevokedResult,
    recordScanAttempt,
    pendingTreatmentSelection,
    requestTreatmentSelection,
    clearTreatmentSelection,
  } = useScannerChannelStore();

  // Modals
  const [sellModalState, setSellModalState] = useState<{
    isOpen: boolean;
    guest: GuestDto | null;
    preselectedTemplateId?: string | null;
  }>({ isOpen: false, guest: null });

  const [deductModalState, setDeductModalState] = useState<{
    isOpen: boolean;
    guest: GuestDto | null;
    /** Beolvasás után (TICKET-39): a szóba jöhető bérletek az előválasztáshoz. */
    treatmentOptions?: TreatmentSelectionOption[];
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

  const refreshAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['guests'] });
    queryClient.invalidateQueries({ queryKey: ['services'] });
    queryClient.invalidateQueries({ queryKey: ['today-checkins'] });
    queryClient.invalidateQueries({ queryKey: ['today-dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['overdue-memberships'] });
    queryClient.invalidateQueries({ queryKey: ['daily-finance'] });
    queryClient.invalidateQueries({ queryKey: ['pass-templates'] });
    queryClient.invalidateQueries({ queryKey: DISPLAY_DEVICES_QUERY_KEY });
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
      // Alkalmas bérlet (TICKET-39): nincs belépés, a kezelésválasztó ablak nyílik meg.
      if (res.status === CheckInStatus.TREATMENT_SELECTION_REQUIRED) {
        notify.checkInResult(res);
        requestTreatmentSelection(res);
        return;
      }
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

  // Kezelésválasztást igénylő beolvasás (bármelyik oldalról, TICKET-39): a vendég friss adataival
  // megnyílik a kezelésválasztó; a levonás és az üdvözlés a megerősítéskor történik.
  useEffect(() => {
    const request = pendingTreatmentSelection;
    if (!request) return;
    clearTreatmentSelection();
    if (!request.guestId) return;
    api
      .getGuest(request.guestId)
      .then((guest) =>
        setDeductModalState({
          isOpen: true,
          guest,
          treatmentOptions: request.treatmentOptions ?? [],
        }),
      )
      .catch((err) =>
        handleAppError(err, { title: 'A vendég bérletei nem tölthetők be' }),
      );
  }, [pendingTreatmentSelection, clearTreatmentSelection]);

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
        'Minden várakozó beolvasás feldolgozásra került.',
      );
      notifyOfflineTreatmentSelections(res.results);
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
      gender: Gender;
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

  const lastIdentifiedGuest = lastCheckIn?.guestId
    ? (guestsQuery.data ?? []).find((g) => g.id === lastCheckIn.guestId) ?? null
    : null;

  const dashboard = todayDashboardQuery.data;

  // Beolvasás után a vendég frissen betöltött adataival (a keresés miatt a listából hiányozhat is).
  const guestList = guestsQuery.data ?? [];
  const scannedGuest = deductModalState.treatmentOptions
    ? deductModalState.guest
    : null;
  const deductGuests = scannedGuest
    ? [scannedGuest, ...guestList.filter((g) => g.id !== scannedGuest.id)]
    : guestList;
  const deductPreselection = getTreatmentPreselection(
    deductModalState.treatmentOptions ?? [],
    servicesQuery.data ?? [],
  );

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

  const handleSelectMainTab = (nextTab: ReceptionTab) => {
    if (!guestModalState.isOpen && nextTab === activeTab) return;
    setGuestModalState({ isOpen: false, guest: null });
    navigate(RECEPTION_TAB_ROUTES[nextTab].path, {
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
          ? ((guestsQuery.data ?? []).find((g) => g.id === st.guestId) ??
              st.guestSnapshot ??
              null)
          : null;
      setGuestModalState({ isOpen: true, guest: matched });
    } else {
      setGuestModalState({ isOpen: false, guest: null });
    }
  }, [location.key, location.state]);

  const offlineQueueNotice = (
    <OfflineQueueNotice onSyncOfflineQueue={() => void syncOfflineQueue()} />
  );
  // Az átállított recepció a saját `PageHeader`-ében adja a `h1`-et, alatta az offline sávot.
  const deskOwnsHeader = activeTab === 'desk' && !guestModalState.isOpen;
  // A Pénzügy, a Bérletek és az Újdonságok fül is saját `PageHeader`-t ad.
  const tabOwnsTitle = !guestModalState.isOpen;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* A kapcsolatjelzők (QR csatorna, kijelzők, hang, tablet) a fejlécben, minden fülön. */}
      <AppHeaderStatus>
        <ReceptionHeaderStatus connectedDisplays={connectedDisplays} />
      </AppHeaderStatus>
      {/* Az átállított fülek saját, látható `h1`-et adnak (PageHeader); a vendég adatlapja nem. */}
      {!tabOwnsTitle && (
        <h1 className="sr-only">{RECEPTION_TAB_ROUTES[activeTab].title}</h1>
      )}
      {!deskOwnsHeader && offlineQueueNotice}

      {/* Main Content */}
      <div className="space-y-4 md:space-y-6">
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
          <ReceptionDeskTab
            guests={guestsQuery.data ?? []}
            isGuestsLoading={guestsQuery.isLoading}
            guestSearch={guestSearch}
            onGuestSearchChange={setGuestSearch}
            dashboard={dashboard}
            finance={financeQuery.data}
            todayCheckIns={todayCheckInsQuery.data ?? []}
            lastCheckIn={lastCheckIn}
            lastIdentifiedGuest={lastIdentifiedGuest}
            offlineQueueNotice={offlineQueueNotice}
            onScan={handleBarcodeScan}
            onForceDuplicate={(barcode) =>
              scanMutation.mutate({ barcode, forceDuplicate: true })
            }
            onRevoke={(checkInId) => revokeMutation.mutate(checkInId)}
            onOpenGuest={openGuestSheet}
            onOpenDeduct={(guest) => setDeductModalState({ isOpen: true, guest })}
            onOpenSell={(guest) => setSellModalState({ isOpen: true, guest })}
            onOpenSellForGuestId={openSellModalByGuestId}
            onOpenPayment={(guest) =>
              setPaymentModalState({ isOpen: true, guest })
            }
            onOpenDigitalCard={setDigitalCardGuest}
            onOpenFinance={() => handleSelectMainTab('finance')}
          />
        )}

        {activeTab === 'guests' && (
          <GuestsTab
            guests={guestsQuery.data ?? []}
            isLoading={guestsQuery.isPending}
            isError={guestsQuery.isError}
            onRetry={() => void guestsQuery.refetch()}
            search={guestSearch}
            onSearchChange={setGuestSearch}
            onNewGuest={() => openGuestSheet(null)}
            onOpenGuest={openGuestSheet}
            onOpenDigitalCard={setDigitalCardGuest}
            onDeductTreatment={(g) =>
              setDeductModalState({ isOpen: true, guest: g })
            }
            onSellPass={(g, preselectedTemplateId) =>
              setSellModalState({ isOpen: true, guest: g, preselectedTemplateId })
            }
          />
        )}

        {activeTab === 'finance' && (
          <FinanceTab
            overdue={overdueQuery.data}
            finance={financeQuery.data}
            onRecordPayment={(guestId, dueId) =>
              setPaymentModalState({
                isOpen: true,
                guest:
                  (guestId
                    ? guestsQuery.data?.find((g) => g.id === guestId)
                    : guestsQuery.data?.[0]) ?? null,
                preselectedDueId: dueId,
              })
            }
            onCancelPayment={(paymentId) =>
              cancelPaymentMutation.mutate({
                paymentId,
                reason: 'Recepciós kassza sztornó',
              })
            }
          />
        )}

        {activeTab === 'admin' && (
          <PassesTab
            templates={templatesQuery.data ?? []}
            services={servicesQuery.data ?? []}
            onRefreshAll={refreshAll}
          />
        )}

        {activeTab === 'news' && (
          <WhatsNewPanel onOpenReceptionTab={handleSelectMainTab} />
        )}
        </>
        )}
      </div>

      {/* Modals */}
      <DeductTreatmentModal
        isOpen={deductModalState.isOpen}
        initialGuest={deductModalState.guest}
        initialPassId={deductPreselection.passId}
        initialServiceId={deductPreselection.serviceId}
        notice={
          deductModalState.treatmentOptions
            ? 'Alkalmas bérlet: a beolvasás nem rögzített belépést. Válaszd ki a kezelést, a belépés a levonással rögzül.'
            : undefined
        }
        guests={deductGuests}
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
