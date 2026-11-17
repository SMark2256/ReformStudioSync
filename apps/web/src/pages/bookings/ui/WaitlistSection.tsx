import { BookableTreatmentDto, formatTimeOfDay, WaitlistEntryDto, WaitlistStatus } from '@reform/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useId, useState } from 'react';
import { BOOKING_QUERY_KEYS, formatBookingTime, formatDayKey } from '@/entities/booking';
import { GuestPicker } from '@/entities/guest';
import { api, bookingApi } from '@/shared/api';
import { handleAppError } from '@/shared/lib/errors';
import { notify } from '@/shared/lib/notify';
import {
  Badge,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmActionButton,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  ResponsiveTable,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@/shared/ui';
import { studioToday } from '../model/dateInput';

const statusBadge = (entry: WaitlistEntryDto) =>
  entry.status === WaitlistStatus.OFFERED && entry.offerStartsAt && entry.offerExpiresAt ? (
    <Badge variant="warning">
      Ajánlat: {formatBookingTime(entry.offerStartsAt)}, {formatBookingTime(entry.offerExpiresAt)}-ig tartva
    </Badge>
  ) : (
    <Badge variant="secondary">Várakozik</Badge>
  );

/**
 * Várólista (TICKET-57): kezelésre és napra / idősávra. Felszabaduláskor a legrégebben várakozó
 * kap levelet és 30 perces tartást; lejáratkor vagy elutasításkor a következő jön.
 */
export const WaitlistSection: React.FC<{ treatments: BookableTreatmentDto[] }> = ({ treatments }) => {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const waitlist = useQuery({ queryKey: BOOKING_QUERY_KEYS.waitlist, queryFn: () => bookingApi.getWaitlist() });

  const remove = useMutation({
    mutationFn: (id: string) => bookingApi.cancelWaitlistEntry(id),
    onSuccess: () => {
      notify.success('Várólistás jelentkezés törölve');
      void queryClient.invalidateQueries({ queryKey: BOOKING_QUERY_KEYS.all });
    },
    onError: (err) => handleAppError(err, { title: 'A törlés nem sikerült' }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Várólista</CardTitle>
        <CardActions>
          <Button onClick={() => setAdding(true)}>Új várólistás</Button>
        </CardActions>
      </CardHeader>
      <CardContent className="p-0 md:p-0">
        {waitlist.isLoading ? (
          <div className="space-y-2 p-5">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <ResponsiveTable
            caption="Várólista"
            rows={waitlist.data ?? []}
            getRowId={(e) => e.id}
            emptyText="Nincs várakozó vendég. A várólistára a recepció vagy a vendég a nyilvános foglalóban jelentkezhet."
            columns={[
              { key: 'guest', header: 'Vendég', rowHeader: true, cell: (e) => e.guestName },
              { key: 'treatment', header: 'Kezelés', cell: (e) => e.treatmentName },
              { key: 'day', header: 'Nap', cell: (e) => formatDayKey(e.dayKey) },
              {
                key: 'window',
                header: 'Idősáv',
                cell: (e) => `${formatTimeOfDay(e.fromMinutes)}–${formatTimeOfDay(e.toMinutes)}`,
              },
              { key: 'status', header: 'Állapot', cell: statusBadge },
              {
                key: 'actions',
                header: 'Műveletek',
                srOnlyHeader: true,
                align: 'right',
                cell: (e) => (
                  <ConfirmActionButton
                    size="sm"
                    aria-label={`${e.guestName} várólistás jelentkezésének törlése`}
                    confirmLabel="Jelentkezés törlése"
                    description="Ha a vendégnek élő ajánlata van, a tartás megszűnik, és a következő várakozó kap ajánlatot."
                    onConfirm={() => remove.mutate(e.id)}
                  >
                    Törlés
                  </ConfirmActionButton>
                ),
              },
            ]}
          />
        )}
      </CardContent>
      <AddWaitlistDialog open={adding} onOpenChange={setAdding} treatments={treatments} />
    </Card>
  );
};

const AddWaitlistDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  treatments: BookableTreatmentDto[];
}> = ({ open, onOpenChange, treatments }) => {
  const fieldId = useId();
  const queryClient = useQueryClient();
  const [guestId, setGuestId] = useState('');
  const [treatmentId, setTreatmentId] = useState('');
  const [dayKey, setDayKey] = useState(studioToday());
  const [fromTime, setFromTime] = useState('07:00');
  const [toTime, setToTime] = useState('18:00');
  const guests = useQuery({ queryKey: ['guests', 'all'], queryFn: () => api.getGuests(''), enabled: open });

  const join = useMutation({
    mutationFn: () => bookingApi.joinWaitlist({ guestId, treatmentId, dayKey, fromTime, toTime }),
    onSuccess: () => {
      notify.success('Vendég felvéve a várólistára', `${formatDayKey(dayKey)}, ${fromTime}–${toTime}`);
      void queryClient.invalidateQueries({ queryKey: BOOKING_QUERY_KEYS.all });
      onOpenChange(false);
    },
    onError: (err) => handleAppError(err, { title: 'A várólistára vétel nem sikerült' }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Új várólistás jelentkezés</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <GuestPicker guests={guests.data ?? []} value={guestId} onChange={setGuestId} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${fieldId}-treatment`}>Kezelés</Label>
            <Select value={treatmentId} onValueChange={setTreatmentId}>
              <SelectTrigger id={`${fieldId}-treatment`}>
                <SelectValue placeholder="Válassz kezelést" />
              </SelectTrigger>
              <SelectContent>
                {treatments
                  .filter((t) => t.isActive)
                  .map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${fieldId}-day`}>Nap</Label>
              <Input id={`${fieldId}-day`} type="date" value={dayKey} onChange={(e) => setDayKey(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${fieldId}-from`}>Ettől</Label>
              <Input id={`${fieldId}-from`} type="time" value={fromTime} onChange={(e) => setFromTime(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${fieldId}-to`}>Eddig</Label>
              <Input id={`${fieldId}-to`} type="time" value={toTime} onChange={(e) => setToTime(e.target.value)} />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Mégse</Button>
          <Button
            variant="primary"
            disabled={!guestId || !treatmentId || join.isPending}
            onClick={() => join.mutate()}
          >
            Felvétel a várólistára
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
