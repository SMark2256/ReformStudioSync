import {
  CheckInResultPayload,
  DailyFinanceSummaryDto,
  GuestDto,
  LoggedCheckInDto,
  TodayDashboardDto,
} from '@reform/shared';
import { Plus, Ticket, UserCheck, Wallet } from 'lucide-react';
import React, { useId } from 'react';
import {
  Alert,
  AlertDescription,
  Button,
  PageHeader,
  Skeleton,
  StatCard,
} from '@/shared/ui';
import { BarcodeCheckInCard } from './BarcodeCheckInCard';
import { formatHuf } from './format';
import { GuestQuickSearchCard } from './GuestQuickSearchCard';
import { LastCheckInCard } from './LastCheckInCard';
import { TodayCashCard } from './TodayCashCard';
import { TodayCheckInsCard } from './TodayCheckInsCard';

const CELEBRATION_LABELS: Record<
  TodayDashboardDto['celebrants'][number]['type'],
  string
> = {
  BIRTHDAY: 'születésnap',
  NAMEDAY: 'névnap',
  BOTH: 'születés- és névnap',
};

interface ReceptionDeskTabProps {
  guests: GuestDto[];
  isGuestsLoading: boolean;
  guestSearch: string;
  onGuestSearchChange: (value: string) => void;
  dashboard?: TodayDashboardDto;
  finance?: DailyFinanceSummaryDto;
  todayCheckIns: LoggedCheckInDto[];
  lastCheckIn: CheckInResultPayload | null;
  /** Az utoljára beolvasott vendég a vendéglistából. */
  lastIdentifiedGuest: GuestDto | null;
  /** A recepciós eszközsor, a `PageHeader` alatt. */
  toolbar: React.ReactNode;
  onScan: (barcode: string) => void;
  onForceDuplicate: (barcode: string) => void;
  onRevoke: (checkInId: string) => void;
  onOpenGuest: (guest: GuestDto | null) => void;
  onOpenDeduct: (guest: GuestDto | null) => void;
  onOpenSell: (guest: GuestDto | null) => void;
  onOpenSellForGuestId: (guestId: string, templateId?: string | null) => void;
  onOpenPayment: (guest: GuestDto | null) => void;
  onOpenDigitalCard: (guest: GuestDto) => void;
  onOpenFinance: () => void;
}

// Recepció (UI-specifikáció 6.1): gyorsműveletek, eszközsor, napi összesítő, beolvasás, az utoljára
// azonosított vendég, vendégkereső, mai kassza és a mai érkezések naplója.
export const ReceptionDeskTab: React.FC<ReceptionDeskTabProps> = ({
  guests,
  isGuestsLoading,
  guestSearch,
  onGuestSearchChange,
  dashboard,
  finance,
  todayCheckIns,
  lastCheckIn,
  lastIdentifiedGuest,
  toolbar,
  onScan,
  onForceDuplicate,
  onRevoke,
  onOpenGuest,
  onOpenDeduct,
  onOpenSell,
  onOpenSellForGuestId,
  onOpenPayment,
  onOpenDigitalCard,
  onOpenFinance,
}) => {
  const summaryTitleId = useId();
  const fallbackGuest = lastIdentifiedGuest ?? guests[0] ?? null;

  return (
    <div>
      <PageHeader
        title="Recepció"
        description="Beléptetés, bérletek és mai foglalások egy helyen."
        actions={
          <div className="flex flex-wrap gap-2 max-md:[&>*]:flex-1">
            <Button
              title="Köredzés beléptetés (0 levonás) az utoljára azonosított vendégnek"
              onClick={() => {
                if (fallbackGuest) onScan(fallbackGuest.barcode);
              }}
            >
              <UserCheck aria-hidden strokeWidth={1.75} />
              Beléptetés
            </Button>
            <Button
              title="Kezelés kiválasztása és 1 alkalom levonása"
              onClick={() => onOpenDeduct(lastIdentifiedGuest)}
            >
              <Ticket aria-hidden strokeWidth={1.75} />
              Alkalom levonása
            </Button>
            <Button onClick={() => onOpenSell(fallbackGuest)}>Új bérlet</Button>
            <Button
              title="Tagdíj vagy részbefizetés rögzítése"
              onClick={() => onOpenPayment(lastIdentifiedGuest)}
            >
              <Wallet aria-hidden strokeWidth={1.75} />
              Befizetés
            </Button>
            <Button variant="primary" onClick={() => onOpenGuest(null)}>
              <Plus aria-hidden strokeWidth={1.75} />
              Új vendég
            </Button>
          </div>
        }
      />

      <div className="space-y-4">
        {toolbar}

        <section aria-labelledby={summaryTitleId} className="space-y-4">
          <h2 id={summaryTitleId} className="sr-only">
            Napi összesítő
          </h2>
          <div className="grid grid-cols-2 gap-2.5 md:gap-4 xl:grid-cols-4">
            {dashboard ? (
              <>
                <StatCard
                  label="Mai forgalom"
                  value={`${dashboard.arrivalsCount + dashboard.treatmentsUsedCount} fő`}
                  hint={`${dashboard.circuitArrivalsCount} köredzés, ${dashboard.treatmentsUsedCount} kezelés`}
                />
                <StatCard
                  label="Mai bevétel"
                  value={formatHuf(dashboard.todayRevenueHuf)}
                  hint={`Havi: ${formatHuf(dashboard.monthlyRevenueHuf)}`}
                />
                <StatCard
                  label={`Lejárt tagdíjak (${dashboard.overdueCount} fő)`}
                  value={formatHuf(dashboard.overdueTotalHuf)}
                  hint={
                    <>
                      {`1–5 nap: ${dashboard.overdueByBucket.DAYS_1_5} · 6–15 nap: ${dashboard.overdueByBucket.DAYS_6_15} · 15+ nap: ${dashboard.overdueByBucket.DAYS_OVER_15}`}{' '}
                      <Button
                        variant="link"
                        className="text-xs"
                        onClick={onOpenFinance}
                      >
                        Tartozások
                      </Button>
                    </>
                  }
                />
                <StatCard
                  label="Lejáró bérletek"
                  value={dashboard.expiringPasses.length}
                  hint="hamarosan lejár vagy 1–2 alkalom maradt"
                />
              </>
            ) : (
              Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-[92px] rounded-lg" />
              ))
            )}
          </div>

          {dashboard && (
            <Alert>
              <AlertDescription>
                {dashboard.celebrants.length > 0
                  ? `Ma ünnepel: ${dashboard.celebrants
                      .map((c) => `${c.guestName} (${CELEBRATION_LABELS[c.type]})`)
                      .join(', ')}`
                  : 'Ma nincs születés- vagy névnapos vendég.'}
              </AlertDescription>
            </Alert>
          )}
        </section>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-4">
            <BarcodeCheckInCard onScan={onScan} />

            <LastCheckInCard
              lastCheckIn={lastCheckIn}
              guest={lastIdentifiedGuest}
              onOpenGuest={onOpenGuest}
              onOpenDeduct={onOpenDeduct}
              onRevoke={onRevoke}
              onForceDuplicate={onForceDuplicate}
              onOpenSellForGuestId={onOpenSellForGuestId}
            />

            <GuestQuickSearchCard
              guests={guests}
              isLoading={isGuestsLoading}
              search={guestSearch}
              onSearchChange={onGuestSearchChange}
              onScan={onScan}
              onOpenGuest={onOpenGuest}
              onOpenDeduct={onOpenDeduct}
              onOpenDigitalCard={onOpenDigitalCard}
            />
          </div>

          <div className="min-w-0 space-y-4">
            <TodayCashCard finance={finance} onOpenFinance={onOpenFinance} />

            <TodayCheckInsCard checkIns={todayCheckIns} onRevoke={onRevoke} />
          </div>
        </div>
      </div>
    </div>
  );
};
