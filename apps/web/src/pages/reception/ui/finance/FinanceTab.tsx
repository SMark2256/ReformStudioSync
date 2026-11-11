import {
  DailyFinanceSummaryDto,
  OverdueBucket,
  OverdueReportDto,
  OverdueSummaryItemDto,
  PaymentDto,
  PaymentMethod,
} from '@reform/shared';
import { Plus } from 'lucide-react';
import React from 'react';
import {
  Badge,
  Button,
  Card,
  CardActions,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PageHeader,
  ResponsiveTable,
  StatCard,
  type ResponsiveTableColumn,
} from '@/shared/ui';
import { formatHuf } from '../desk/format';
import { ConfirmActionButton } from '../ConfirmActionButton';

const formatShortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' });

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]: 'Készpénz',
  [PaymentMethod.POS_CARD]: 'Bankkártya',
  [PaymentMethod.BANK_TRANSFER]: 'Átutalás',
};

const OVERDUE_BUCKET_LABELS: Record<OverdueBucket, string> = {
  [OverdueBucket.NONE]: 'nincs késés',
  [OverdueBucket.DAYS_1_5]: '1–5 nap',
  [OverdueBucket.DAYS_6_15]: '6–15 nap',
  [OverdueBucket.DAYS_OVER_15]: '15+ nap',
};

// A Pénzügy oldalon mutatott késési kategóriák (a `NONE` nem lejárt tétel).
const OVERDUE_BUCKETS = [
  OverdueBucket.DAYS_1_5,
  OverdueBucket.DAYS_6_15,
  OverdueBucket.DAYS_OVER_15,
] as const;

const bucketVariant = (bucket: OverdueBucket) =>
  bucket === OverdueBucket.DAYS_OVER_15 ? 'destructive' : 'warning';

interface FinanceTabProps {
  overdue: OverdueReportDto | undefined;
  finance: DailyFinanceSummaryDto | undefined;
  /** Új befizetés; tagdíjsorból a vendég és az esedékesség előre kiválasztva. */
  onRecordPayment: (guestId?: string, dueId?: string) => void;
  onCancelPayment: (paymentId: string) => void;
}

// Pénzügy (`/finance`): napi kassza, lejárt tagdíjak és a mai tranzakciók sztornóval.
export const FinanceTab: React.FC<FinanceTabProps> = ({
  overdue,
  finance,
  onRecordPayment,
  onCancelPayment,
}) => {
  const overdueColumns: ResponsiveTableColumn<OverdueSummaryItemDto>[] = [
    {
      key: 'guest',
      header: 'Vendég',
      rowHeader: true,
      cell: (item) => (
        <span className="inline-flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{item.guestName}</span>
          <span className="font-mono text-xs text-muted-foreground">
            #{item.guestBarcode}
          </span>
        </span>
      ),
    },
    {
      key: 'period',
      header: 'Időszak',
      cell: (item) => (
        <>
          {item.period}{' '}
          <span className="text-muted-foreground">
            (esedékes: {formatShortDate(item.dueDate)})
          </span>
        </>
      ),
    },
    {
      key: 'bucket',
      header: 'Késés',
      cell: (item) => (
        <Badge variant={bucketVariant(item.overdueBucket)}>
          {item.overdueDays} nap ({OVERDUE_BUCKET_LABELS[item.overdueBucket]})
        </Badge>
      ),
    },
    {
      key: 'paid',
      header: 'Előírt / fizetett',
      align: 'right',
      hideOnMobile: true,
      cell: (item) =>
        `${formatHuf(item.amountHuf)} / ${formatHuf(item.paidAmountHuf)}`,
    },
    {
      key: 'remaining',
      header: 'Hátralék',
      align: 'right',
      cell: (item) => (
        <span className="font-semibold">{formatHuf(item.remainingHuf)}</span>
      ),
    },
    {
      key: 'action',
      header: 'Művelet',
      srOnlyHeader: true,
      align: 'right',
      cell: (item) => (
        <Button
          variant="link"
          aria-label={`${item.guestName} befizetésének rögzítése`}
          onClick={() => onRecordPayment(item.guestId, item.dueId)}
        >
          Befizetés rögzítése
        </Button>
      ),
    },
  ];

  const paymentColumns: ResponsiveTableColumn<PaymentDto>[] = [
    {
      key: 'time',
      header: 'Idő',
      cell: (p) => (
        <span className="font-mono text-xs text-muted-foreground">
          {new Date(p.createdAt).toLocaleTimeString('hu-HU', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      ),
    },
    {
      key: 'guest',
      header: 'Vendég',
      rowHeader: true,
      cell: (p) => <span className="font-medium">{p.guestName}</span>,
    },
    {
      key: 'item',
      header: 'Tétel',
      hideOnMobile: true,
      cell: (p) => p.passName ?? p.note,
    },
    {
      key: 'method',
      header: 'Fizetési mód',
      cell: (p) => PAYMENT_METHOD_LABELS[p.paymentMethod],
    },
    {
      key: 'amount',
      header: 'Összeg',
      align: 'right',
      cell: (p) => (
        <span
          className={
            p.isCancelled
              ? 'text-muted-foreground line-through'
              : 'font-semibold'
          }
        >
          {formatHuf(p.amount)}
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Művelet',
      srOnlyHeader: true,
      align: 'right',
      cell: (p) =>
        p.isCancelled ? (
          <Badge variant="secondary">Sztornózva</Badge>
        ) : (
          <ConfirmActionButton
            variant="link"
            aria-label={`${p.guestName} fizetésének sztornózása`}
            confirmLabel="Fizetés sztornózása"
            description={`${p.guestName} ${formatHuf(p.amount)} összegű fizetése sztornózva lesz, és kikerül a napi kasszából.`}
            onConfirm={() => onCancelPayment(p.id)}
          >
            Sztornó
          </ConfirmActionButton>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Pénzügy"
        description="Napi kassza, befizetések és a lejárt havi tagdíjak késési kategóriák szerint."
        actions={
          <Button variant="primary" onClick={() => onRecordPayment()}>
            <Plus aria-hidden strokeWidth={1.75} />
            Befizetés rögzítése
          </Button>
        }
      />

      <div className="space-y-4">
        <section aria-labelledby="finance-summary-title">
          <h2 id="finance-summary-title" className="sr-only">
            Napi kassza
          </h2>
          <div className="grid grid-cols-2 gap-2.5 md:gap-4 xl:grid-cols-4">
            <StatCard
              label="Napi összbevétel"
              value={formatHuf(finance?.totalRevenue ?? 0)}
              hint={`${finance?.activeTransactionCount ?? 0} aktív tranzakció`}
            />
            <StatCard
              label="Készpénz"
              value={formatHuf(finance?.byMethod.CASH ?? 0)}
            />
            <StatCard
              label="Bankkártya"
              value={formatHuf(finance?.byMethod.POS_CARD ?? 0)}
            />
            <StatCard
              label="Átutalás"
              value={formatHuf(finance?.byMethod.BANK_TRANSFER ?? 0)}
            />
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Lejárt tagdíjak</CardTitle>
            <CardDescription>késési kategóriák szerint</CardDescription>
            <CardActions>
              {OVERDUE_BUCKETS.map((bucket) => (
                <Badge key={bucket} variant={bucketVariant(bucket)}>
                  {OVERDUE_BUCKET_LABELS[bucket]}:{' '}
                  {overdue?.buckets[bucket].length ?? 0} fő
                </Badge>
              ))}
            </CardActions>
          </CardHeader>
          <CardContent className="p-0 md:p-0">
            <ResponsiveTable
              caption="Lejárt tagdíjak"
              columns={overdueColumns}
              rows={overdue?.items ?? []}
              getRowId={(item) => item.dueId}
              emptyText="Nincs lejárt tagdíj-tartozás."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mai tranzakciók</CardTitle>
          </CardHeader>
          <CardContent className="p-0 md:p-0">
            <ResponsiveTable
              caption="Mai tranzakciók"
              columns={paymentColumns}
              rows={finance?.payments ?? []}
              getRowId={(p) => p.id}
              emptyText="Ma még nem volt befizetés."
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
};
