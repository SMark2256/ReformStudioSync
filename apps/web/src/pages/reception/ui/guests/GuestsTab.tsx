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
import { cn } from '@/shared/lib/utils';
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

// Egy sorra vágott szöveg táblacellában: asztalin a `w-0 min-w-full` miatt nem szélesíti az
// oszlopot, hanem kitölti, amennyi hely jut neki (a teljes szöveg a `title`-ben). Mobilon a
// kártyasor értékoszlopában sima `truncate`.
const FLUID_TRUNCATE = 'truncate md:w-0 md:min-w-full';

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
      className: 'whitespace-nowrap',
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
      className: 'w-[26%]',
      // Legfeljebb 2 sor: név + 1 sorra vágott megjegyzés (teljes szöveg a `title`-ben).
      cell: ({ guest, name }) => (
        <span className="flex min-w-0 items-center gap-2.5 max-md:justify-end">
          <Avatar name={name} size="sm" className="max-md:hidden" />
          <span className="min-w-0 md:flex-1">
            <span
              className="block max-w-[16rem] truncate font-semibold max-md:max-w-none"
              title={name}
            >
              {name}
            </span>
            {guest.notes && (
              <span
                className={cn(
                  'block text-xs font-normal text-muted-foreground max-md:hidden',
                  FLUID_TRUNCATE,
                )}
                title={guest.notes}
              >
                {guest.notes}
              </span>
            )}
          </span>
        </span>
      ),
    },
    {
      // 1280 px alatt (mint mobilon) rejtve, hogy a Bérlet oszlop kiférjen; a telefon és az
      // e-mail az adatlapon látszik, és a kereső is megtalálja.
      key: 'phone',
      header: 'Telefon',
      className: 'hidden w-[16%] xl:table-cell',
      cell: ({ guest }) => (
        <span className="block">
          <span className="block whitespace-nowrap tabular-nums">
            {guest.phone ?? '—'}
          </span>
          {guest.email && (
            <span
              className={cn(
                'block text-xs text-muted-foreground',
                FLUID_TRUNCATE,
              )}
              title={guest.email}
            >
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
      className: 'w-[30%]',
      // 1. sor a bérlet neve (+N további), 2. sor a havi tagság; mindkettő 1 sorra vágva.
      cell: ({ guest, summary }) => {
        const membership = (guest.memberships ?? [])[0];
        const passName = summary.pass
          ? (summary.pass.passTemplateName ?? 'Bérlet')
          : null;
        const otherPasses =
          summary.otherPassCount > 0
            ? `(+${summary.otherPassCount} további)`
            : null;
        const membershipText = membership
          ? `Havi tagság: ${membership.monthlyFeeHuf.toLocaleString('hu-HU')} Ft/hó${
              membership.status !== MembershipStatus.ACTIVE
                ? ` (${MEMBERSHIP_STATUS_LABEL[membership.status].toLocaleLowerCase('hu-HU')})`
                : ''
            }`
          : null;
        if (!passName && !membershipText) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <span className="block">
            {passName && (
              <span
                className="flex min-w-0 items-baseline gap-1 max-md:justify-end md:w-0 md:min-w-full"
                title={otherPasses ? `${passName} ${otherPasses}` : passName}
              >
                <span className="truncate">{passName}</span>
                {otherPasses && (
                  <span className="shrink-0 whitespace-nowrap text-muted-foreground">
                    {otherPasses}
                  </span>
                )}
              </span>
            )}
            {membershipText && (
              <span
                className={cn(
                  'block text-xs text-muted-foreground tabular-nums',
                  FLUID_TRUNCATE,
                )}
                title={membershipText}
              >
                {membershipText}
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
      className: 'whitespace-nowrap',
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
        {/* Szűrősor: asztalin cím, szegmens és kereső egy sorban; mobilon a szegmens és a
            kereső külön sorban, teljes szélességben. */}
        <CardHeader className="gap-x-6 gap-y-3">
          <div className="flex items-baseline gap-3">
            <CardTitle>Vendéglista</CardTitle>
            <span
              aria-live="polite"
              className="text-xs text-muted-foreground tabular-nums"
            >
              {isLoading ? '' : `${visibleRows.length} találat`}
            </span>
          </div>
          <CardActions className="gap-x-4 gap-y-3">
            <ToggleGroup
              type="single"
              aria-label="Szűrés bérletállapot szerint"
              value={filter}
              onValueChange={(value) => {
                if (value) setFilter(value as GuestPassFilter);
              }}
              className="w-full md:w-fit"
            >
              {FILTERS.map((f) => (
                <ToggleGroupItem key={f.value} value={f.value}>
                  {f.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
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
            <div className="space-y-3 p-4 md:p-5">
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
            <div className="space-y-3 p-4 md:p-5">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-10" />
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
