import {
  CheckInResultPayload,
  CheckInRevokedPayload,
  CheckInStatus,
  DUPLICATE_SCAN_COOLDOWN_SECONDS,
  GuestDto,
  MonitorCheckInPayload,
  MonitorCheckInRevokedPayload,
  PassType,
  PaymentMethod,
  toMonitorPayload,
  toMonitorRevokedPayload,
  TreatmentSelectionOption,
  VisitType,
} from '@reform/shared';
import {
  CheckCircle2,
  CloudOff,
  FileSignature,
  QrCode,
  RefreshCw,
  RotateCcw,
  Ticket,
  UserPlus,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { normalizeScannedCode } from '@/shared/lib/barcode-scanner';
import { broadcastToScannerChannel } from '@/shared/lib/monitor-channel';
import { mockStudioEngine } from '@/shared/api';
import { handleAppError } from '@/shared/lib/errors';
import { notify } from '@/shared/lib/notify';
import { useOfflineQueueStore } from '@/entities/check-in';
import { useScannerChannelStore } from '@/entities/check-in';
import {
  Badge,
  Button,
  Card,
  CardActions,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  PageHeader,
} from '@/shared/ui';
import { DigitalPassCardModal } from '@/entities/guest';
import { GuestModal } from '@/widgets/guest-profile';
import { MonitorDisplayCard } from '@/entities/check-in';
import {
  DeductTreatmentModal,
  getTreatmentPreselection,
} from '@/features/deduct-treatment';
import { RecordPaymentModal } from '@/features/record-payment';
import { SellPassModal } from '@/features/sell-pass';

interface ScenarioButtonProps {
  /** A gomb nevének eleje (a tesztek erre keresnek), pl. „Kovács Anna (Köredzés)”. */
  name: string;
  tag: string;
  title: string;
  hint: string;
  onClick: () => void;
}

// Szimulált beolvasás egy előre beállított vendéggel és helyzettel.
const ScenarioButton: React.FC<ScenarioButtonProps> = ({
  name,
  tag,
  title,
  hint,
  onClick,
}) => (
  <Button
    variant="secondary"
    onClick={onClick}
    className="h-auto flex-col items-start gap-0.5 whitespace-normal p-3 text-left coarse:h-auto"
  >
    <span className="flex w-full items-center justify-between gap-2">
      <span className="text-[13px] font-semibold text-foreground">{name}</span>
      <span className="font-mono text-xs font-normal text-muted-foreground">
        {tag}
      </span>
    </span>
    <span className="text-xs font-medium text-foreground">{title}</span>
    <span className="text-xs font-normal text-muted-foreground">{hint}</span>
  </Button>
);

export const DemoSandboxPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [, setTick] = useState(0);
  const forceRender = useCallback(() => setTick((t) => t + 1), []);

  const [monitorResult, setMonitorResult] =
    useState<MonitorCheckInPayload | null>(null);
  const [revokedBanner, setRevokedBanner] =
    useState<MonitorCheckInRevokedPayload | null>(null);
  const monitorTimerRef = useRef<number | null>(null);

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

  const {
    lastCheckInResult,
    lastRevokedResult,
    recordCheckInResult,
    recordRevokedResult,
    recordScanAttempt,
  } = useScannerChannelStore();

  const guests = mockStudioEngine.getGuests();
  const services = mockStudioEngine.getServices(true);
  const templates = mockStudioEngine.getTemplates(true);
  const todayCheckIns = mockStudioEngine.getTodayCheckIns();
  const financeSummary = mockStudioEngine.getDailyFinanceSummary();

  const deductPreselection = getTreatmentPreselection(
    deductModalState.treatmentOptions ?? [],
    services,
  );

  const activeModalGuest = guestModalState.guest
    ? (guests.find((g) => g.id === guestModalState.guest?.id) ??
      guestModalState.guest)
    : null;

  const showOnEmbeddedMonitor = useCallback((payload: CheckInResultPayload) => {
    if (monitorTimerRef.current) window.clearTimeout(monitorTimerRef.current);
    setRevokedBanner(null);
    setMonitorResult(toMonitorPayload(payload));
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
      setRevokedBanner(toMonitorRevokedPayload(payload));
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
        recordRevokedResult(revoked);
        broadcastToScannerChannel({
          type: 'CHECKIN_REVOKED',
          payload: revoked,
        });
        showRevokedOnEmbeddedMonitor(revoked);
        notify.success(
          `Beléptetés / Levonás sztornózva: ${revoked.guestName}`,
          `Aktuális egyenleg: ${revoked.restoredRemainingPasses}`,
        );
        forceRender();
      } catch (err) {
        handleAppError(err, { title: 'Sztornó hiba' });
      }
    },
    [recordRevokedResult, showRevokedOnEmbeddedMonitor, forceRender],
  );

  const handleSimulatedScan = useCallback(
    (
      rawBarcode: string,
      forceDuplicate = false,
      visitType: VisitType = VisitType.CIRCUIT_TRAINING,
      serviceId?: string,
    ) => {
      const barcode = normalizeScannedCode(rawBarcode);
      if (!barcode) return;

      recordScanAttempt(barcode);

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
        // Alkalmas bérlet (TICKET-39): nincs belépés, a kezelésválasztó ablak nyílik meg.
        if (result.status === CheckInStatus.TREATMENT_SELECTION_REQUIRED) {
          notify.checkInResult(result);
          setDeductModalState({
            isOpen: true,
            guest:
              mockStudioEngine
                .getGuests()
                .find((g) => g.id === result.guestId) ?? null,
            treatmentOptions: result.treatmentOptions ?? [],
          });
          return;
        }
        recordCheckInResult(result);
        broadcastToScannerChannel({ type: 'CHECKIN_RESULT', payload: result });
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
        handleAppError(err, { title: 'Beléptetési hiba' });
      }
    },
    [
      recordScanAttempt,
      isOnline,
      enqueueScan,
      recordCheckInResult,
      showOnEmbeddedMonitor,
      handleRevokeCheckIn,
      forceRender,
    ],
  );

  // Szinkronizáljuk a globális szkenner csatorna eredményét a beágyazott demo monitorral is
  useEffect(() => {
    if (lastCheckInResult) {
      showOnEmbeddedMonitor(lastCheckInResult);
      forceRender();
    }
  }, [lastCheckInResult, showOnEmbeddedMonitor, forceRender]);

  useEffect(() => {
    if (lastRevokedResult) {
      showRevokedOnEmbeddedMonitor(lastRevokedResult);
      forceRender();
    }
  }, [lastRevokedResult, showRevokedOnEmbeddedMonitor, forceRender]);

  const handleResetDemo = () => {
    mockStudioEngine.resetDatabase();
    clearQueue();
    setMonitorResult(null);
    setRevokedBanner(null);
    notify.success(
      'Demo adatbázis alaphelyzetbe állítva',
      'Minden tesztvendég, tagság, bérlet, fotó és pénzügyi tranzakció visszaállt a kiinduló állapotba.',
    );
    forceRender();
  };

  const handleSyncOffline = () => {
    if (offlineQueue.length === 0) return;
    const res = mockStudioEngine.syncOfflineScans(offlineQueue);
    clearQueue();
    setOnline(true);
    const recorded = res.results.filter(
      (r) => r.status !== CheckInStatus.TREATMENT_SELECTION_REQUIRED,
    );
    if (recorded.length > 0) {
      showOnEmbeddedMonitor(recorded[recorded.length - 1]);
    }
    notify.success(
      `Offline várólista feldolgozva (${res.processed} db beolvasás)`,
      'Az összes offline beolvasott vonalkód szinkronizálva lett.',
    );
    if (res.treatmentSelectionRequired > 0) {
      notify.warning(
        `Kezelésválasztás kell (${res.treatmentSelectionRequired} offline beolvasás)`,
        'Alkalmas bérletnél nem rögzült belépés; a kezelést a „Kezelés -1” gombbal vond le.',
      );
    }
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
    <div>
      <PageHeader
        title="Interaktív Demo & Tesztkörnyezet"
        description="Köredzés (0 levonás) vs. Alkalmas Kezelés (Hypoxi -1), 10 mp dupla védelem, Vendégkartoték és adatvédett Vendégmonitor."
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link to="/tablet">
                <FileSignature aria-hidden strokeWidth={1.75} />
                Tablet Aláíró (/tablet)
              </Link>
            </Button>
            <Button variant="secondary" onClick={handleResetDemo}>
              <RefreshCw aria-hidden strokeWidth={1.75} />
              Demo Adatok Visszaállítása (Reset)
            </Button>
          </>
        }
      />

      <div className="space-y-4 md:space-y-6">
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
                  data.id ? 'Vendég frissítve' : 'Új tesztvendég létrehozva',
                  `${saved.lastName} ${saved.firstName} (#${saved.barcode})`,
                );
                if (!data.id) {
                  closeGuestSheet();
                }
                forceRender();
              } catch (err) {
                handleAppError(err, { title: 'Mentési hiba' });
              }
            }}
            onExtendPass={(passId, additionalDays, note) => {
              mockStudioEngine.extendPass(passId, additionalDays, note);
              notify.success(`Bérlet meghosszabbítva (+${additionalDays} nap)`);
              forceRender();
            }}
            onToggleFreezePass={(passId, note) => {
              try {
                mockStudioEngine.toggleFreezePass(passId, note);
                notify.success('Bérlet fagyasztási státusza frissítve');
                forceRender();
              } catch (err) {
                handleAppError(err, { title: 'Fagyasztási hiba' });
              }
            }}
            onOpenDigitalCard={(g) => setDigitalCardGuest(g)}
            onRefreshAll={forceRender}
          />
        ) : (
          <>
            {/* Szimulátor (bal) + beágyazott, adatvédett vendégmonitor (jobb) */}
            <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-2">
              <Card className="flex flex-col">
                <CardHeader>
                  <CardTitle>
                    1. Köredzés (2.3) vs. Kezelés Levonás (2.4) Szimulátor
                  </CardTitle>
                  <CardActions>
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-pressed={!isOnline}
                      onClick={() => {
                        const next = !isOnline;
                        setOnline(next);
                        if (!next) {
                          notify.warning(
                            'Offline szimuláció bekapcsolva',
                            'A következő vonalkód-beolvasások az Offline Pufferbe kerülnek.',
                          );
                        } else {
                          notify.info('Online mód visszaállítva');
                        }
                      }}
                    >
                      <CloudOff
                        aria-hidden
                        strokeWidth={1.75}
                        className={isOnline ? undefined : 'text-warning'}
                      />
                      {isOnline
                        ? 'Hálózat: Online'
                        : `Offline mód (${offlineQueue.length} várakozik)`}
                    </Button>
                  </CardActions>
                </CardHeader>
                <CardContent className="flex-1 space-y-4">
                  <p className="text-[13px] text-muted-foreground">
                    Próbáld ki a különbséget a köredzéses érkezés (0 levonás,
                    diszkrét üdvözlés) és az alkalmas kezelés (Hypoxi -1
                    alkalom, hátralévő egyenleg) között. Dupla leolvasás
                    védelem: {DUPLICATE_SCAN_COOLDOWN_SECONDS} mp.
                  </p>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <ScenarioButton
                      name="Kovács Anna (Köredzés)"
                      tag="#100001"
                      title="2.3 Köredzés érkezés (0 levonás)"
                      hint="Monitor: „Üdvözlünk, Kovács Anna! Jó edzést kívánunk!”"
                      onClick={() =>
                        handleSimulatedScan(
                          '100001',
                          false,
                          VisitType.CIRCUIT_TRAINING,
                        )
                      }
                    />
                    <ScenarioButton
                      name="Kovács Anna (Hypoxi -1)"
                      tag="2.4 kezelés"
                      title="Hypoxi kezelés (-1 alkalom levonás)"
                      hint="Monitor: „Hypoxi Kezelés. Hátralévő alkalmak: X...”"
                      onClick={() => {
                        const anna = guests.find((g) => g.barcode === '100001');
                        const hypoxiPass = anna?.passes?.find(
                          (p) => p.isActive,
                        );
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
                    />
                    <ScenarioButton
                      name="Nagy Péter (Tartozás teszt)"
                      tag="#100002"
                      title="1–5 napos tagdíj késés (22 000 Ft)"
                      hint="A recepció látja a tartozást, a Vendégmonitor nem."
                      onClick={() =>
                        handleSimulatedScan(
                          '100002',
                          false,
                          VisitType.CIRCUIT_TRAINING,
                        )
                      }
                    />
                    <ScenarioButton
                      name="Nagy Péter (Utolsó 1 alk.)"
                      tag="1 alkalom"
                      title="Utolsó 1 alkalom levonása (0 marad)"
                      hint="Teszteli: bérlet kimerülés figyelmeztetés"
                      onClick={() => {
                        const peter = guests.find(
                          (g) => g.barcode === '100002',
                        );
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
                    />
                    <ScenarioButton
                      name="Tóth Gábor (15+ nap késés)"
                      tag="#100004"
                      title="15+ nap tartozás és lejárt bérlet"
                      hint="Teszteli: diszkrét monitor elutasítás"
                      onClick={() => handleSimulatedScan('100004')}
                    />
                    <ScenarioButton
                      name="Horváth Dóra"
                      tag="#100006"
                      title="Szüneteltetett tagság és fagyasztott bérlet"
                      hint="Teszteli: szüneteltetés ellenőrzés"
                      onClick={() => handleSimulatedScan('100006')}
                    />
                  </div>
                </CardContent>

                <CardFooter>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setDeductModalState({ isOpen: true, guest: guests[0] })
                    }
                  >
                    <Ticket aria-hidden strokeWidth={1.75} />
                    Kezelés levonó modál
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setPaymentModalState({ isOpen: true, guest: guests[1] })
                    }
                  >
                    <Wallet aria-hidden strokeWidth={1.75} />
                    Tagdíj befizetés modál
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openGuestSheet(guests[0])}
                  >
                    <Users aria-hidden strokeWidth={1.75} />
                    Adatlap
                  </Button>
                  {offlineQueue.length > 0 && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSyncOffline}
                    >
                      <RefreshCw aria-hidden strokeWidth={1.75} />
                      Offline puffer szinkronizálása ({offlineQueue.length} db)
                    </Button>
                  )}
                </CardFooter>
              </Card>

              <section
                aria-labelledby="demo-monitor-title"
                className="flex min-w-0 flex-col gap-2"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h2
                    id="demo-monitor-title"
                    className="text-sm font-semibold text-foreground"
                  >
                    2. Élő adatvédett vendégmonitor-előnézet
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Soha nem mutat tartozást vagy vonalkódot. Valós idejű
                    szinkron (&lt;1 ms).
                  </p>
                </div>
                <MonitorDisplayCard
                  activeResult={monitorResult}
                  revokedBanner={revokedBanner}
                  compact={true}
                />
              </section>
            </div>

            {/* Vendégek, digitális kártyák, bérletkezelés (bal) + kassza és napló sztornóval (jobb) */}
            <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Card>
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle>
                      3. Vendégek, kartoték, digitális kártyák és bérletkezelés
                    </CardTitle>
                    <CardDescription>
                      Az Adatlap gomb a tagságokat, méréseket, fényképeket és
                      dokumentumokat mutatja.
                    </CardDescription>
                  </div>
                  <CardActions>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => openGuestSheet(null)}
                    >
                      <UserPlus aria-hidden strokeWidth={1.75} />
                      Új Tesztvendég
                    </Button>
                  </CardActions>
                </CardHeader>

                <ul
                  aria-label="Tesztvendégek"
                  className="divide-y divide-border"
                >
                  {guests.map((g) => {
                    const pass = (g.passes ?? [])[0];
                    const isExpired =
                      pass &&
                      new Date(pass.expirationDate).getTime() < Date.now();
                    const guestName = `${g.lastName} ${g.firstName}`;

                    return (
                      <li
                        key={g.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              variant="link"
                              onClick={() => openGuestSheet(g)}
                            >
                              {guestName}
                            </Button>
                            <span className="font-mono text-xs text-muted-foreground">
                              #{g.barcode}
                            </span>
                            {pass?.isFrozen && (
                              <Badge variant="secondary">Fagyasztva</Badge>
                            )}
                            {isExpired && (
                              <Badge variant="destructive">Lejárt</Badge>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {pass
                              ? `${pass.passTemplateName} · Egyenleg: ${
                                  pass.type === PassType.TIME_BASED
                                    ? 'Korlátlan'
                                    : `${pass.remainingPasses} / ${pass.totalPasses} alk.`
                                } · Lejár: ${new Date(pass.expirationDate).toLocaleDateString('hu-HU')}`
                              : 'Nincs bérlet'}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              handleSimulatedScan(
                                g.barcode,
                                false,
                                VisitType.CIRCUIT_TRAINING,
                              )
                            }
                          >
                            Köredzés
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              setDeductModalState({ isOpen: true, guest: g })
                            }
                          >
                            Kezelés -1
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openGuestSheet(g)}
                          >
                            Adatlap
                          </Button>
                          <Button
                            variant="secondary"
                            size="icon"
                            onClick={() => setDigitalCardGuest(g)}
                            aria-label={`${guestName} digitális belépőkártyája`}
                          >
                            <QrCode aria-hidden strokeWidth={1.75} />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>

              <div className="min-w-0 space-y-4 md:space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>4. Napi kassza és fizetés sztornó</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-2xl font-semibold tabular-nums text-foreground">
                      {financeSummary.totalRevenue.toLocaleString('hu-HU')} Ft
                    </p>
                    <dl className="grid grid-cols-3 gap-2 text-xs">
                      {(
                        [
                          ['Készpénz', financeSummary.byMethod.CASH],
                          ['Kártya', financeSummary.byMethod.POS_CARD],
                          ['Átutalás', financeSummary.byMethod.BANK_TRANSFER],
                        ] as const
                      ).map(([label, amount]) => (
                        <div
                          key={label}
                          className="rounded-md border border-border bg-muted px-2 py-1.5"
                        >
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd className="font-semibold tabular-nums text-foreground">
                            {amount.toLocaleString('hu-HU')} Ft
                          </dd>
                        </div>
                      ))}
                    </dl>

                    <ul
                      aria-label="Mai befizetések"
                      className="max-h-44 divide-y divide-border overflow-y-auto border-t border-border"
                    >
                      {financeSummary.payments.map((pay) => (
                        <li
                          key={pay.id}
                          className="flex items-center justify-between gap-2 py-2 text-xs"
                        >
                          <div
                            className={
                              pay.isCancelled
                                ? 'text-muted-foreground line-through'
                                : undefined
                            }
                          >
                            <span className="font-semibold">
                              {pay.guestName}
                            </span>
                            <span className="block text-muted-foreground">
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
                            <Button
                              variant="link"
                              size="sm"
                              aria-label={`${pay.guestName} fizetésének sztornózása`}
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
                            >
                              Sztornó
                            </Button>
                          ) : (
                            <Badge variant="secondary">Sztornózva</Badge>
                          )}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>
                      5. Érkezési és kezelési napló, sztornó
                    </CardTitle>
                  </CardHeader>
                  <ul
                    aria-label="Mai érkezések és kezelések"
                    className="max-h-60 divide-y divide-border overflow-y-auto"
                  >
                    {todayCheckIns.map((log) => (
                      <li
                        key={log.id}
                        className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          {log.status === CheckInStatus.SUCCESS ? (
                            <CheckCircle2
                              aria-hidden
                              strokeWidth={1.75}
                              className="size-4 shrink-0 text-success"
                            />
                          ) : log.status === CheckInStatus.CANCELLED ? (
                            <RotateCcw
                              aria-hidden
                              strokeWidth={1.75}
                              className="size-4 shrink-0 text-warning"
                            />
                          ) : (
                            <XCircle
                              aria-hidden
                              strokeWidth={1.75}
                              className="size-4 shrink-0 text-destructive"
                            />
                          )}
                          <div className="min-w-0">
                            <span className="font-semibold text-foreground">
                              {log.guestName}
                            </span>
                            <span className="block text-muted-foreground">
                              {log.status === CheckInStatus.CANCELLED
                                ? 'Sztornózva'
                                : (log.serviceName ??
                                  log.passName ??
                                  log.reason)}
                            </span>
                          </div>
                        </div>

                        {log.status === CheckInStatus.SUCCESS && (
                          <Button
                            variant="link"
                            size="sm"
                            aria-label={`${log.guestName} beléptetésének sztornózása`}
                            onClick={() => handleRevokeCheckIn(log.id)}
                          >
                            Sztornó
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>
            </div>
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
        onOpenSellPass={(guest) => setSellModalState({ isOpen: true, guest })}
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
