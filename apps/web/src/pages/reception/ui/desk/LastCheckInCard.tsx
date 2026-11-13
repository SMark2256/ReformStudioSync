import {
  CheckInResultPayload,
  CheckInStatus,
  greetingForCheckIn,
  GuestDto,
} from '@reform/shared';
import { AlertTriangle, RotateCcw, Ticket, Users } from 'lucide-react';
import React from 'react';
import { isTestEnvironment } from '@/shared/api';
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
  DataList,
  DataListItem,
} from '@/shared/ui';
import { CHECK_IN_STATUS_BADGES } from './checkInStatus';
import { formatHuf } from './format';

interface LastCheckInCardProps {
  lastCheckIn: CheckInResultPayload | null;
  /** A beolvasott vendég a vendéglistából (adatlap, kezelés levonása). */
  guest: GuestDto | null;
  onOpenGuest: (guest: GuestDto) => void;
  onOpenDeduct: (guest: GuestDto) => void;
  onRevoke: (checkInId: string) => void;
  onForceDuplicate: (barcode: string) => void;
  onOpenSellForGuestId: (guestId: string, templateId?: string | null) => void;
}

// Az utoljára azonosított vendég: állapot, bérlet, tartozás és a gyorsműveletek.
export const LastCheckInCard: React.FC<LastCheckInCardProps> = ({
  lastCheckIn,
  guest,
  onOpenGuest,
  onOpenDeduct,
  onRevoke,
  onForceDuplicate,
  onOpenSellForGuestId,
}) => {
  const statusBadge = lastCheckIn && CHECK_IN_STATUS_BADGES[lastCheckIn.status];
  const isDenied = lastCheckIn?.status === CheckInStatus.DENIED;
  const showsPassBalance =
    (lastCheckIn?.status === CheckInStatus.SUCCESS ||
      lastCheckIn?.status === CheckInStatus.DUPLICATE_SCAN) &&
    lastCheckIn.mode !== 'CIRCUIT_GREETING';
  // A szolgáltatás neve a közös üdvözlés-térképből (TICKET-43), mint a monitoron és a toastban.
  const greeting = lastCheckIn && greetingForCheckIn(lastCheckIn);

  return (
    <Card data-tour="reception.last-check-in">
      <CardHeader>
        <CardTitle>Utoljára azonosított vendég</CardTitle>
        {lastCheckIn && (
          <CardActions className="justify-end">
            <time
              dateTime={lastCheckIn.timestamp}
              className="font-mono text-xs text-muted-foreground"
            >
              {new Date(lastCheckIn.timestamp).toLocaleTimeString('hu-HU', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
          </CardActions>
        )}
      </CardHeader>

      <CardContent>
        {!lastCheckIn || !statusBadge ? (
          <div className="py-4 text-center text-[13px] text-muted-foreground">
            <p>Még nem történt vendégazonosítás ebben a munkamenetben.</p>
            <p className="mt-1 text-xs">
              {isTestEnvironment()
                ? 'Olvass be egy vonalkódot, vagy válassz egy tesztkártyát.'
                : 'Olvass be egy vonalkódot.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Avatar name={lastCheckIn.guestName} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-foreground">
                    {lastCheckIn.guestName}
                  </h3>
                  <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                  <Badge variant="secondary" dot={false}>
                    {lastCheckIn.mode === 'CIRCUIT_GREETING'
                      ? `${greeting?.kind} (0 levonás)`
                      : `${greeting?.kind}: ${lastCheckIn.serviceName ?? 'Alkalom levonás'}`}
                  </Badge>
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                  #{lastCheckIn.barcode}
                </p>
                <p className="mt-1 text-[13px] text-foreground">
                  {lastCheckIn.passName ??
                    lastCheckIn.reason ??
                    'Nincs aktív bérlet'}
                </p>
              </div>
            </div>

            {lastCheckIn.overdueAmountHuf !== undefined &&
              lastCheckIn.overdueAmountHuf > 0 && (
              <Alert variant="destructive">
                <AlertTriangle aria-hidden strokeWidth={1.75} />
                <AlertDescription>
                  Havi tagdíj elmaradás (csak a recepción látható):{' '}
                  {formatHuf(lastCheckIn.overdueAmountHuf)} (
                  {lastCheckIn.overdueDays ?? 1} nap késés)
                </AlertDescription>
              </Alert>
            )}

            {showsPassBalance && (
              <DataList>
                <DataListItem label="Fennmaradó">
                  {lastCheckIn.remainingPasses === 'Korlátlan'
                    ? 'Korlátlan'
                    : `${lastCheckIn.remainingPasses} / ${lastCheckIn.totalPasses ?? '?'} alkalom`}
                </DataListItem>
                <DataListItem label="Érvényes">
                  {lastCheckIn.expirationDate
                    ? new Date(lastCheckIn.expirationDate).toLocaleDateString(
                        'hu-HU',
                      )
                    : '—'}
                </DataListItem>
              </DataList>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {guest && (
                <>
                  <Button size="sm" onClick={() => onOpenGuest(guest)}>
                    <Users aria-hidden strokeWidth={1.75} />
                    Adatlap
                  </Button>
                  <Button size="sm" onClick={() => onOpenDeduct(guest)}>
                    <Ticket aria-hidden strokeWidth={1.75} />
                    Kezelés levonása
                  </Button>
                </>
              )}

              {lastCheckIn.status === CheckInStatus.SUCCESS &&
                lastCheckIn.checkInId && (
                  <Button
                    size="sm"
                    onClick={() => onRevoke(lastCheckIn.checkInId!)}
                  >
                    <RotateCcw aria-hidden strokeWidth={1.75} />
                    Sztornó
                  </Button>
                )}

              {lastCheckIn.status === CheckInStatus.DUPLICATE_SCAN && (
                <Button
                  size="sm"
                  onClick={() => onForceDuplicate(lastCheckIn.barcode)}
                >
                  Mégis rögzítés
                </Button>
              )}

              {lastCheckIn.guestId && (
                <Button
                  size="sm"
                  variant={isDenied ? 'primary' : 'secondary'}
                  onClick={() =>
                    onOpenSellForGuestId(
                      lastCheckIn.guestId!,
                      lastCheckIn.suggestedRenewalTemplateId,
                    )
                  }
                >
                  Új bérlet eladása
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
