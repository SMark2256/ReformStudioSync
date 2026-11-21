import {
  BookingDto,
  BookingSource,
  BookingStatus,
  toAppError,
  toStudioDayKey,
} from '@reform/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useId, useState } from 'react';
import {
  BOOKING_QUERY_KEYS,
  BookingStatusBadge,
  bookingStatusLabel,
  deductionText,
  formatBookingMoment,
  formatBookingTime,
  passWarningText,
  SlotPicker,
} from '@/entities/booking';
import { bookingApi } from '@/shared/api';
import { handleAppError } from '@/shared/lib/errors';
import { notify } from '@/shared/lib/notify';
import {
  Alert,
  Button,
  Checkbox,
  ConfirmActionButton,
  DataList,
  DataListItem,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@/shared/ui';

const SOURCE_LABEL: Record<BookingSource, string> = {
  [BookingSource.ONLINE]: 'Online foglalás',
  [BookingSource.RECEPTION]: 'Recepció',
  [BookingSource.WAITLIST]: 'Várólistáról',
};

const OPEN = [BookingStatus.CONFIRMED, BookingStatus.LATE];

interface BookingDetailsDialogProps {
  booking: BookingDto | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Foglalás adatai és műveletei: megérkezett / késik / nem jelent meg (pontosan egy levonás,
 * automatikus „nem jelent meg” nincs), áthelyezés, lemondás és auditnapló.
 */
export const BookingDetailsDialog: React.FC<BookingDetailsDialogProps> = ({ booking, onOpenChange }) => {
  const fieldId = useId();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'details' | 'reschedule'>('details');
  const [current, setCurrent] = useState<BookingDto | null>(booking);
  const [dayKey, setDayKey] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [override, setOverride] = useState(false);

  useEffect(() => {
    setCurrent(booking);
    setMode('details');
    setStartsAt('');
    setOverride(false);
    if (booking) setDayKey(toStudioDayKey(booking.startsAt));
  }, [booking]);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: BOOKING_QUERY_KEYS.all });

  const audit = useQuery({
    queryKey: BOOKING_QUERY_KEYS.audit(current?.id ?? ''),
    queryFn: () => bookingApi.getBookingAudit(current!.id),
    enabled: Boolean(current) && mode === 'details',
  });

  const availability = useQuery({
    queryKey: BOOKING_QUERY_KEYS.availability({ scope: 'reschedule', id: current?.id, dayKey, override }),
    queryFn: () =>
      bookingApi.getAvailability({
        dayKey,
        treatmentIds: [current!.treatmentId],
        guestId: current!.guestId,
        override,
        excludeBookingId: current!.id,
      }),
    enabled: Boolean(current) && mode === 'reschedule' && Boolean(dayKey),
  });

  const statusMutation = useMutation({
    mutationFn: (status: BookingStatus) => bookingApi.setBookingStatus(current!.id, { status }),
    onSuccess: (result) => {
      setCurrent(result.booking);
      notify.success(
        `${result.booking.guestName}: ${result.booking.treatmentName}, ${
          result.booking.status === BookingStatus.CONFIRMED ? 'állapot visszaállítva' : `„${bookingStatusLabel(result.booking.status)}”`
        }`,
        deductionText(result),
      );
      refresh();
    },
    onError: (err) => handleAppError(err, { title: 'Az állapot nem változott' }),
  });

  const rescheduleMutation = useMutation({
    mutationFn: () => bookingApi.rescheduleBooking(current!.id, { startsAt, overrideRules: override }),
    onSuccess: (moved) => {
      notify.success(`${moved.guestName} áthelyezve`, `${moved.treatmentName}, ${formatBookingMoment(moved.startsAt)}`);
      setCurrent(moved);
      setMode('details');
      refresh();
    },
    onError: (err) => {
      if (toAppError(err).code === 'BOOKING.CAPACITY_FULL') void availability.refetch();
      handleAppError(err, { title: 'Az áthelyezés nem sikerült' });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => bookingApi.cancelBooking(current!.id, {}),
    onSuccess: (cancelled) => {
      notify.success(`${cancelled.guestName} foglalása lemondva`, `${cancelled.treatmentName}, ${formatBookingMoment(cancelled.startsAt)}`);
      refresh();
      onOpenChange(false);
    },
    onError: (err) => handleAppError(err, { title: 'A lemondás nem sikerült' }),
  });

  if (!current) return null;
  const isOpen = OPEN.includes(current.status);
  const busy = statusMutation.isPending || rescheduleMutation.isPending || cancelMutation.isPending;

  return (
    <Dialog open={Boolean(booking)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {current.guestName}, {current.treatmentName}
          </DialogTitle>
        </DialogHeader>

        {mode === 'details' ? (
          <>
            <DialogBody className="space-y-5">
              <DataList>
                <DataListItem label="Időpont">
                  {formatBookingMoment(current.startsAt)}–{formatBookingTime(current.endsAt)}
                </DataListItem>
                <DataListItem label="Gép">{current.resourceName}</DataListItem>
                <DataListItem label="Állapot">
                  <BookingStatusBadge status={current.status} />
                </DataListItem>
                <DataListItem label="Vendég">
                  {current.guestName} (#{current.guestBarcode}
                  {current.guestPhone ? `, ${current.guestPhone}` : ''})
                </DataListItem>
                <DataListItem label="Bérlet">
                  {current.deducted ? '1 alkalom levonva' : 'Nincs levonás (megérkezéskor vagy „Nem jelent meg”-nél)'}
                </DataListItem>
                <DataListItem label="Forrás">{SOURCE_LABEL[current.source]}</DataListItem>
                {current.note && <DataListItem label="Megjegyzés">{current.note}</DataListItem>}
              </DataList>

              {current.passWarning && <Alert>{passWarningText(current.passWarning)}</Alert>}

              {current.status !== BookingStatus.CANCELLED && (
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground">Érkezés</h3>
                  <div className="flex flex-wrap gap-2">
                    {current.status !== BookingStatus.ARRIVED && (
                      <Button disabled={busy} onClick={() => statusMutation.mutate(BookingStatus.ARRIVED)}>
                        Megérkezett
                      </Button>
                    )}
                    {current.status === BookingStatus.CONFIRMED && (
                      <Button disabled={busy} onClick={() => statusMutation.mutate(BookingStatus.LATE)}>
                        Késik
                      </Button>
                    )}
                    {current.status !== BookingStatus.NO_SHOW && (
                      <ConfirmActionButton
                        disabled={busy}
                        confirmLabel="Nem jelent meg rögzítése"
                        description="A vendég bérletéről 1 alkalom levonódik (ha van felhasználható bérlete). Visszaállítással a levonás visszavonható."
                        onConfirm={() => statusMutation.mutate(BookingStatus.NO_SHOW)}
                      >
                        Nem jelent meg
                      </ConfirmActionButton>
                    )}
                    {current.status !== BookingStatus.CONFIRMED && (
                      <Button disabled={busy} onClick={() => statusMutation.mutate(BookingStatus.CONFIRMED)}>
                        Visszaállítás
                      </Button>
                    )}
                  </div>
                </section>
              )}

              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground">Napló</h3>
                {audit.data && audit.data.length > 0 ? (
                  <ul className="space-y-1.5 text-[13px]">
                    {audit.data.map((entry) => (
                      <li key={entry.id} className="border-b border-border pb-1.5 last:border-b-0">
                        <span className="tabular-nums text-muted-foreground">{formatBookingMoment(entry.createdAt)}</span>
                        {' · '}
                        <span className="text-foreground">{entry.details ?? entry.action}</span>
                        <span className="text-muted-foreground"> ({entry.userName ?? 'vendég, online'})</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-muted-foreground">Még nincs bejegyzés.</p>
                )}
              </section>
            </DialogBody>
            <DialogFooter>
              {isOpen && (
                <ConfirmActionButton
                  disabled={busy}
                  confirmLabel="Foglalás lemondása"
                  description="A foglalás lemondva lesz; ha több kezelés tartozik hozzá, a többi megmarad. A felszabaduló helyre a várólista kap ajánlatot."
                  onConfirm={() => cancelMutation.mutate()}
                >
                  Lemondás
                </ConfirmActionButton>
              )}
              {isOpen && (
                <Button disabled={busy} onClick={() => setMode('reschedule')}>
                  Áthelyezés
                </Button>
              )}
              <Button onClick={() => onOpenChange(false)}>Bezárás</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogBody className="space-y-5">
              <p className="text-[13px] text-muted-foreground">
                Jelenleg: {formatBookingMoment(current.startsAt)}. A kapacitás nem írható felül.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${fieldId}-day`}>Új nap</Label>
                  <Input
                    id={`${fieldId}-day`}
                    type="date"
                    value={dayKey}
                    onChange={(e) => {
                      setDayKey(e.target.value);
                      setStartsAt('');
                    }}
                  />
                </div>
                <div className="flex items-center gap-2 sm:pt-6">
                  <Checkbox
                    id={`${fieldId}-override`}
                    checked={override}
                    onCheckedChange={(checked) => setOverride(checked === true)}
                  />
                  <Label htmlFor={`${fieldId}-override`} className="text-[13px] font-normal text-foreground">
                    Időkorlát felülírása (30 nap, 30 perc, 24 óra)
                  </Label>
                </div>
              </div>
              <SlotPicker
                label="Szabad időpontok az áthelyezéshez"
                slots={availability.data?.slots}
                loading={availability.isLoading}
                value={startsAt}
                onChange={setStartsAt}
                showRemaining
                emptyText="Ezen a napon nincs szabad időpont."
              />
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => setMode('details')}>Mégse</Button>
              <Button variant="primary" disabled={!startsAt || busy} onClick={() => rescheduleMutation.mutate()}>
                Áthelyezés mentése
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
