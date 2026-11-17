import { BookingStatus, toAppError, toStudioDayKey } from '@reform/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useId, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BookingStatusBadge, formatBookingMoment, formatBookingTime, SlotPicker } from '@/entities/booking';
import { bookingApi } from '@/shared/api';
import { notify } from '@/shared/lib/notify';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  ConfirmActionButton,
  DataList,
  DataListItem,
  Input,
  Label,
  Skeleton,
} from '@/shared/ui';
import { PublicLayout } from './PublicLayout';

/**
 * Foglalás kezelése a levélben kapott linkkel (`/foglalas/kezeles/:token`): áthelyezés és
 * lemondás a kezdés előtt legalább 24 órával. A link csak ezt az egy foglalást mutatja.
 */
export const ManageBookingPage: React.FC = () => {
  const { token = '' } = useParams();
  const fieldId = useId();
  const queryClient = useQueryClient();
  const [rescheduling, setRescheduling] = useState(false);
  const [dayKey, setDayKey] = useState('');
  const [startsAt, setStartsAt] = useState('');

  const managed = useQuery({
    queryKey: ['public-booking', 'manage', token],
    queryFn: () => bookingApi.getManagedBooking(token),
    retry: false,
  });
  const booking = managed.data;
  useEffect(() => {
    if (booking && !dayKey) setDayKey(toStudioDayKey(booking.startsAt));
  }, [booking, dayKey]);

  const availability = useQuery({
    queryKey: ['public-booking', 'manage', token, 'availability', dayKey],
    queryFn: () => bookingApi.getManagedAvailability(token, dayKey),
    enabled: rescheduling && Boolean(dayKey),
  });

  const update = (next: Awaited<ReturnType<typeof bookingApi.getManagedBooking>>) =>
    queryClient.setQueryData(['public-booking', 'manage', token], next);

  const reschedule = useMutation({
    mutationFn: () => bookingApi.rescheduleManagedBooking(token, startsAt),
    onSuccess: (next) => {
      update(next);
      setRescheduling(false);
      setStartsAt('');
      notify.success('Időpont módosítva', `${next.treatmentName}, ${formatBookingMoment(next.startsAt)}`);
    },
  });
  const cancel = useMutation({
    mutationFn: () => bookingApi.cancelManagedBooking(token),
    onSuccess: (next) => {
      update(next);
      notify.success('Foglalás lemondva', `${next.treatmentName}, ${formatBookingMoment(next.startsAt)}`);
    },
  });
  const actionError = reschedule.error ?? cancel.error;

  return (
    <PublicLayout title="Foglalás kezelése">
      {managed.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : managed.isError || !booking ? (
        <Alert variant="destructive">{toAppError(managed.error).message}</Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {booking.guestFirstName ? `${booking.guestFirstName}, ` : ''}
              {booking.treatmentName}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <DataList>
              <DataListItem label="Időpont">
                {formatBookingMoment(booking.startsAt)}–{formatBookingTime(booking.endsAt)}
              </DataListItem>
              <DataListItem label="Állapot">
                <BookingStatusBadge status={booking.status} />
              </DataListItem>
              {booking.locationText && <DataListItem label="Helyszín">{booking.locationText}</DataListItem>}
            </DataList>

            {booking.status === BookingStatus.CANCELLED ? (
              <Alert>Ez a foglalás le van mondva.</Alert>
            ) : !booking.canChange ? (
              <Alert>
                Online módosításra és lemondásra a kezdés előtt legalább 24 órával van lehetőség (eddig:{' '}
                {formatBookingMoment(booking.changeDeadline)}). Most már a recepció tud segíteni.
              </Alert>
            ) : (
              <p className="text-[13px] text-muted-foreground">
                Online módosítás és lemondás eddig lehetséges: {formatBookingMoment(booking.changeDeadline)}.
              </p>
            )}

            {rescheduling && booking.canChange && (
              <section className="space-y-3">
                <h3 className="text-xs font-semibold text-muted-foreground">Új időpont</h3>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${fieldId}-day`}>Nap</Label>
                  <Input
                    id={`${fieldId}-day`}
                    type="date"
                    value={dayKey}
                    onChange={(e) => {
                      setDayKey(e.target.value);
                      setStartsAt('');
                    }}
                    className="w-44"
                  />
                </div>
                <SlotPicker
                  label="Szabad időpontok"
                  slots={availability.data?.slots}
                  loading={availability.isLoading}
                  value={startsAt}
                  onChange={setStartsAt}
                  emptyText="Ezen a napon nincs szabad időpont. Válassz másik napot."
                />
              </section>
            )}
            {actionError && <Alert variant="destructive">{toAppError(actionError).message}</Alert>}
          </CardContent>
          {booking.canChange && (
            <CardFooter className="justify-end">
              {rescheduling ? (
                <>
                  <Button onClick={() => setRescheduling(false)}>Mégse</Button>
                  <Button variant="primary" disabled={!startsAt || reschedule.isPending} onClick={() => reschedule.mutate()}>
                    Időpont módosítása
                  </Button>
                </>
              ) : (
                <>
                  <ConfirmActionButton
                    disabled={cancel.isPending}
                    confirmLabel="Foglalás lemondása"
                    description="A foglalásod lemondjuk, az időpont felszabadul."
                    onConfirm={() => cancel.mutate()}
                  >
                    Lemondás
                  </ConfirmActionButton>
                  <Button variant="primary" onClick={() => setRescheduling(true)}>
                    Áthelyezés
                  </Button>
                </>
              )}
            </CardFooter>
          )}
        </Card>
      )}
    </PublicLayout>
  );
};
