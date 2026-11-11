import { GuestDto, MembershipStatus } from '@reform/shared';
import { MoreHorizontal, Plus } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import {
  formatRemainingPasses,
  formatShortDate,
  getGuestPassSummary,
  type GuestPassFilter,
  type GuestPassSummary,
  MEMBERSHIP_STATUS_LABEL,
} from '@/entities/guest';
import {
  Alert,
  AlertDescription,
  Avatar,
  Badge,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Label,
  PageHeader,
  ResponsiveTable,
  type ResponsiveTableColumn,
  SearchInput,
  Skeleton,
  ToggleGroup,
  ToggleGroupItem,
} from '@/shared/ui';

interface GuestRow {
  guest: GuestDto;
  name: string;
  summary: GuestPassSummary;
}

interface GuestsTabProps {
  guests: GuestDto[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  onNewGuest: () => void;
  onOpenGuest: (guest: GuestDto) => void;
  onOpenDigitalCard: (guest: GuestDto) => void;
  onDeductTreatment: (guest: GuestDto) => void;
  onSellPass: (guest: GuestDto, suggestedTemplateId?: string) => void;
}

const FILTERS: { value: GuestPassFilter; label: string }[] = [
  { value: 'all', label: 'Mind' },
  { value: 'valid', label: 'Érvényes' },
  { value: 'expiring', label: 'Hamarosan lejár' },
  { value: 'expired', label: 'Lejárt / elfogyott' },
];

const SEARCH_ID = 'guest-list-search';

// Vendégek oldal (UI-specifikáció 6.4): kereshető, szűrhető vendéglista; egy sorra kattintva
// megnyílik a vendég adatlapja.
export const GuestsTab: React.FC<GuestsTabProps> = ({
  guests,
  isLoading,
  isError,
  onRetry,
  search,
  onSearchChange,
  onNewGuest,
  onOpenGuest,
  onOpenDigitalCard,
  onDeductTreatment,
  onSellPass,
}) => {
  const [filter, setFilter] = useState<GuestPassFilter>('all');

  const rows = useMemo<GuestRow[]>(
    () =>
      guests.map((guest) => ({
        guest,
        name: `${guest.lastName} ${guest.firstName}`,
        summary: getGuestPassSummary(guest),
      })),
    [guests],
  );
  const visibleRows =
    filter === 'all' ? rows : rows.filter((r) => r.summary.filter === filter);

  const columns: ResponsiveTableColumn<GuestRow>[] = [
    {
      key: 'barcode',
      header: 'Kártya',
      cell: ({ guest }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {guest.barcode}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Név',
      rowHeader: true,
      cell: ({ guest, name }) => (
        <span className="inline-flex min-w-0 items-center gap-2.5">
          <Avatar name={name} size="sm" className="max-md:hidden" />
          <span className="min-w-0">
            <span className="block font-semibold">{name}</span>
            {guest.notes && (
              <span className="block truncate text-xs font-normal text-muted-foreground max-md:hidden">
                {guest.notes}
              </span>
            )}
          </span>
        </span>
      ),
    },
    {
      key: 'phone',
      header: 'Telefon',
      cell: ({ guest }) => (
        <span>
          {guest.phone ?? '—'}
          {guest.email && (
            <span className="block text-xs text-muted-foreground">
              {guest.email}
            </span>
          )}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      key: 'pass',
      header: 'Bérlet',
      cell: ({ guest, summary }) => {
        const membership = (guest.memberships ?? [])[0];
        return (
          <span>
            {summary.pass ? (
              <span className="block">
                {summary.pass.passTemplateName ?? 'Bérlet'}
                {summary.otherPassCount > 0 && (
                  <span className="text-muted-foreground">
                    {' '}
                    (+{summary.otherPassCount} további)
                  </span>
                )}
              </span>
            ) : (
              !membership && <span className="text-muted-foreground">—</span>
            )}
            {membership && (
              <span className="block text-xs text-muted-foreground">
                Havi tagság: {membership.monthlyFeeHuf.toLocaleString('hu-HU')}{' '}
                Ft/hó
                {membership.status !== MembershipStatus.ACTIVE &&
                  ` (${MEMBERSHIP_STATUS_LABEL[membership.status].toLocaleLowerCase('hu-HU')})`}
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: 'remaining',
      header: 'Fennmaradó',
      align: 'right',
      className: 'whitespace-nowrap',
      cell: ({ summary }) =>
        summary.pass ? formatRemainingPasses(summary.pass) : '—',
    },
    {
      key: 'expires',
      header: 'Lejárat',
      align: 'right',
      className: 'whitespace-nowrap',
      cell: ({ summary }) =>
        summary.pass ? formatShortDate(summary.pass.expirationDate) : '—',
    },
    {
      key: 'status',
      header: 'Állapot',
      cell: ({ summary }) => (
        <Badge variant={summary.badge.variant}>{summary.badge.label}</Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Műveletek',
      srOnlyHeader: true,
      align: 'right',
      cell: ({ guest, name, summary }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              size="icon"
              aria-label={`${name} műveletei`}
            >
              <MoreHorizontal aria-hidden strokeWidth={1.75} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onOpenGuest(guest)}>
              Adatlap
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onOpenDigitalCard(guest)}>
              Digitális kártya
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onDeductTreatment(guest)}>
              Kezelés levonása
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onSellPass(guest, summary.pass?.passTemplateId)}
            >
              Bérlet eladása
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Vendégek"
        description={`${search ? '' : `${guests.length} regisztrált vendég. `}Egy sorra kattintva megnyílik a vendég adatlapja.`}
        actions={
          <Button variant="primary" onClick={onNewGuest}>
            <Plus aria-hidden strokeWidth={1.75} />
            Új vendég
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Vendéglista</CardTitle>
          <CardActions>
            <ToggleGroup
              type="single"
              aria-label="Szűrés bérletállapot szerint"
              value={filter}
              onValueChange={(value) => {
                if (value) setFilter(value as GuestPassFilter);
              }}
            >
              {FILTERS.map((f) => (
                <ToggleGroupItem key={f.value} value={f.value}>
                  {f.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <span
              aria-live="polite"
              className="text-xs text-muted-foreground tabular-nums"
            >
              {isLoading ? '' : `${visibleRows.length} találat`}
            </span>
            <Label htmlFor={SEARCH_ID} className="sr-only">
              Keresés a vendégek között
            </Label>
            <SearchInput
              id={SEARCH_ID}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Név, kártyaszám, telefon vagy e-mail"
            />
          </CardActions>
        </CardHeader>
        <CardContent className="p-0 md:p-0">
          {isError ? (
            <div className="space-y-3 p-4">
              <Alert variant="destructive">
                <AlertDescription>
                  A vendéglista nem töltődött be. Ellenőrizd a kapcsolatot, és
                  próbáld újra.
                </AlertDescription>
              </Alert>
              <Button variant="secondary" onClick={onRetry}>
                Újrapróbálás
              </Button>
            </div>
          ) : isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-9" />
              ))}
            </div>
          ) : (
            <ResponsiveTable
              caption="Vendéglista"
              columns={columns}
              rows={visibleRows}
              getRowId={(row) => row.guest.id}
              onRowOpen={(row) => onOpenGuest(row.guest)}
              emptyText={
                search || filter !== 'all'
                  ? 'Nincs a keresésnek megfelelő vendég.'
                  : 'Még nincs vendég. Vegyél fel egyet az Új vendég gombbal.'
              }
            />
          )}
        </CardContent>
      </Card>
    </>
  );
};
