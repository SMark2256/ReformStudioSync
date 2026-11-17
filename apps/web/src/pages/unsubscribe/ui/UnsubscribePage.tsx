import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toAppError } from '@reform/shared';
import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/shared/api';
import { Alert, AlertDescription, Button, Card, CardContent, Skeleton } from '@/shared/ui';

// Nyilvános leiratkozás (TICKET-55): a marketing levél láblécének linkje ide mutat. Belépés nélkül,
// a vendégenként egyedi tokennel; az oldal megnyitása még nem iratkoztat le (a levelezők előre
// letöltik a linkeket), csak a gomb.
export const UnsubscribePage: React.FC = () => {
  const { token = '' } = useParams();
  const queryClient = useQueryClient();
  const queryKey = ['unsubscribe', token];
  const infoQuery = useQuery({
    queryKey,
    queryFn: () => api.getUnsubscribeInfo(token),
    retry: false,
  });
  const unsubscribeMutation = useMutation({
    mutationFn: () => api.unsubscribe(token),
    onSuccess: (info) => queryClient.setQueryData(queryKey, info),
  });

  useEffect(() => {
    document.title = 'Leiratkozás · ReformStudio Sync';
  }, []);

  const info = infoQuery.data;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-4 p-6 md:p-8">
          <h1 className="text-xl font-semibold text-foreground">Leiratkozás</h1>
          {infoQuery.isPending && <Skeleton className="h-16 w-full" />}
          {infoQuery.isError && (
            <Alert variant="destructive">
              <AlertDescription>{toAppError(infoQuery.error).message}</AlertDescription>
            </Alert>
          )}
          {info && info.unsubscribed && (
            <p className="text-sm" data-testid="unsubscribe-done">
              Kedves {info.firstName}, leiratkoztál. A {info.studioName} nem küld neked több
              hírlevelet és köszöntőt. A bérletedhez kapcsolódó szolgáltatási levelek (pl.
              visszaigazolás) továbbra is megérkeznek.
            </p>
          )}
          {info && !info.unsubscribed && (
            <>
              <p className="text-sm">
                Kedves {info.firstName}, ha nem szeretnél több hírlevelet, ajánlatot és
                köszöntőt kapni a {info.studioName} csapatától, iratkozz le itt.
              </p>
              <Button
                variant="primary"
                className="w-full"
                disabled={unsubscribeMutation.isPending}
                onClick={() => unsubscribeMutation.mutate()}
              >
                Leiratkozás
              </Button>
              <p className="text-xs text-muted-foreground">
                Később a recepción újra feliratkozhatsz.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
};
