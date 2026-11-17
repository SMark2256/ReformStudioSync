import { toAppError, WaitlistStatus } from '@reform/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatBookingMoment, formatBookingTime } from '@/entities/booking';
import { bookingApi } from '@/shared/api';
import { Alert, Button, Card, CardContent, CardFooter, CardHeader, CardTitle, Skeleton } from '@/shared/ui';
import { PublicLayout } from './PublicLayout';

/** Várólistás ajánlat a levélben kapott linkkel: a tartott időpont lefoglalása vagy elengedése. */
export const WaitlistOfferPage: React.FC = () => {
  const { token = '' } = useParams();
  const queryClient = useQueryClient();
  const offer = useQuery({
    queryKey: ['public-booking', 'waitlist', token],
    queryFn: () => bookingApi.getWaitlistOffer(token),
    retry: false,
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['public-booking', 'waitlist', token] });
  const accept = useMutation({ mutationFn: () => bookingApi.acceptWaitlistOffer(token), onSuccess: refresh });
  const decline = useMutation({ mutationFn: () => bookingApi.declineWaitlistOffer(token), onSuccess: refresh });
  const data = offer.data;
  const live =
    data?.status === WaitlistStatus.OFFERED && data.offerExpiresAt && new Date(data.offerExpiresAt) > new Date();
  const error = accept.error ?? decline.error;

  return (
    <PublicLayout title="Felszabadult időpont">
      {offer.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : offer.isError || !data ? (
        <Alert variant="destructive">{toAppError(offer.error).message}</Alert>
      ) : accept.data ? (
        <Card>
          <CardContent className="space-y-3 text-[13px]">
            <p className="text-foreground">
              Lefoglaltuk: {accept.data.booking.treatmentName}, {formatBookingMoment(accept.data.booking.startsAt)}.
              A visszaigazolást e-mailben is elküldtük.
            </p>
            <Link
              className="text-primary-text underline underline-offset-[3px]"
              to={`/foglalas/kezeles/${accept.data.booking.manageToken}`}
            >
              Foglalás kezelése
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {data.guestFirstName ? `${data.guestFirstName}, ` : ''}
              {data.treatmentName}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-[13px]">
            {live && data.offerStartsAt && data.offerExpiresAt ? (
              <p className="text-foreground">
                Felszabadult egy időpont a várólistán: <strong>{formatBookingMoment(data.offerStartsAt)}</strong>.{' '}
                {formatBookingTime(data.offerExpiresAt)}-ig neked tartjuk.
              </p>
            ) : (
              <Alert>
                {data.status === WaitlistStatus.BOOKED
                  ? 'Ezt az időpontot már lefoglaltad.'
                  : data.status === WaitlistStatus.DECLINED
                    ? 'Az ajánlatot elengedted; a következő várakozó kapja meg.'
                    : 'Az ajánlat lejárt. A következő felszabaduló helyről újra értesítünk, ha még várólistán vagy.'}
              </Alert>
            )}
            {error && <Alert variant="destructive">{toAppError(error).message}</Alert>}
          </CardContent>
          {live && (
            <CardFooter className="justify-end">
              <Button disabled={decline.isPending || accept.isPending} onClick={() => decline.mutate()}>
                Nem kérem
              </Button>
              <Button variant="primary" disabled={accept.isPending || decline.isPending} onClick={() => accept.mutate()}>
                Időpont lefoglalása
              </Button>
            </CardFooter>
          )}
        </Card>
      )}
    </PublicLayout>
  );
};
