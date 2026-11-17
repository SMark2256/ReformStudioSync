import { IntakeGuestExitResponseDto, toAppError } from '@reform/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TabletSmartphone } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThemeToggleButton } from '@/features/toggle-theme';
import { api } from '@/shared/api';
import { useAuthStore, useIntakeGuestStore } from '@/shared/auth';
import { APP_ROUTES } from '@/shared/config';
import { useIntakeSocket } from '@/shared/lib/intake-socket';
import { notify } from '@/shared/lib/notify';
import { Button, Input, Label } from '@/shared/ui';
import { GuestIntakeFlow } from './GuestIntakeFlow';

const CLAIM_POLL_MS = 4000;
const CLAIM_QUERY_KEY = ['intake', 'device-claim'] as const;

/**
 * A tablet vendégfelvétel oldala (TICKET-56, `/tablet/intake`), keret nélkül:
 * - vendégtokennel: a vendégmód (csak az adott kitöltés, kilépés csak munkatársi kóddal);
 * - párosított tabletként: várakozás a recepcióra (socket.io, tartalékként időközönként);
 * - különben: a tablet párosítása a Monitorok oldalon kapott kóddal.
 */
export const TabletIntakePage: React.FC = () => {
  const navigate = useNavigate();
  const guestToken = useIntakeGuestStore((s) => s.guestToken);
  const sessionId = useIntakeGuestStore((s) => s.sessionId);
  const startGuest = useIntakeGuestStore((s) => s.start);
  const clearGuest = useIntakeGuestStore((s) => s.clear);
  const deviceToken = useAuthStore((s) => s.deviceToken);
  const setAuth = useAuthStore((s) => s.setAuth);
  const queryClient = useQueryClient();

  useEffect(() => {
    document.title = 'Vendégfelvétel · ReformStudio Sync';
  }, []);

  useIntakeSocket(deviceToken, {
    onAssigned: () => void queryClient.invalidateQueries({ queryKey: CLAIM_QUERY_KEY }),
    onReleased: (payload) => {
      if (payload.sessionId === useIntakeGuestStore.getState().sessionId) clearGuest();
    },
  });

  const handleExited = (result: IntakeGuestExitResponseDto) => {
    const exitedSessionId = sessionId;
    clearGuest();
    if (result.staff) {
      setAuth(result.staff.accessToken, result.staff.user);
      navigate(`${APP_ROUTES.intake.path}${exitedSessionId ? `?session=${exitedSessionId}` : ''}`);
    }
  };

  const handleTokenInvalid = useCallback(() => {
    clearGuest();
    notify.info('A vendégmód lezárult', 'A kitöltést a recepció lezárta vagy lejárt.');
    // A PC-n indított vendégmód után a munkatársnak újra be kell lépnie.
    if (!useAuthStore.getState().deviceToken) navigate('/login');
  }, [clearGuest, navigate]);

  if (guestToken) {
    return (
      <GuestIntakeFlow
        guestToken={guestToken}
        onExited={handleExited}
        onTokenInvalid={handleTokenInvalid}
      />
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <p className="text-base font-semibold">Re-Form Stúdió · Vendégfelvétel</p>
          <ThemeToggleButton />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-xl flex-1 items-center px-4 py-8 focus:outline-none">
        {deviceToken ? (
          <TabletWaiting
            deviceToken={deviceToken}
            onAssigned={(assignment) => {
              // A régi átvétel ne induljon újra a vendégmód után.
              queryClient.removeQueries({ queryKey: CLAIM_QUERY_KEY });
              startGuest(assignment);
            }}
          />
        ) : (
          <TabletPairing />
        )}
      </main>
    </div>
  );
};

const TabletWaiting: React.FC<{
  deviceToken: string;
  onAssigned: (session: { sessionId: string; guestToken: string; expiresAt: string }) => void;
}> = ({ deviceToken, onAssigned }) => {
  const deviceName = useAuthStore((s) => s.deviceName);
  const clearDeviceAuth = useAuthStore((s) => s.clearDeviceAuth);
  const claimQuery = useQuery({
    queryKey: [...CLAIM_QUERY_KEY, deviceToken],
    queryFn: () => api.claimIntakeForDevice(deviceToken),
    refetchInterval: CLAIM_POLL_MS,
    retry: false,
  });

  const assignment = claimQuery.data?.assignment;
  useEffect(() => {
    if (assignment) onAssigned(assignment);
  }, [assignment, onAssigned]);

  if (claimQuery.error) {
    return (
      <section role="alert" className="w-full space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Ez az eszköz nem vendégfelvételi tablet</h1>
        <p className="text-sm text-muted-foreground">{toAppError(claimQuery.error).message}</p>
        <Button type="button" onClick={clearDeviceAuth}>
          Új párosítás
        </Button>
      </section>
    );
  }

  return (
    <section className="w-full space-y-3 rounded-lg border border-border bg-card p-8 text-center shadow-sm">
      <TabletSmartphone aria-hidden className="mx-auto size-10 text-muted-foreground" />
      <h1 className="text-xl font-semibold">Szia, üdvözlünk a Re-Form Stúdióban</h1>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        A tablet készen áll. A recepció hamarosan elküldi ide a kitöltendő adatlapot.
      </p>
      {deviceName && <p className="text-xs text-muted-foreground">Eszköz: {deviceName}</p>}
    </section>
  );
};

const TabletPairing: React.FC = () => {
  const [code, setCode] = useState('');
  const setDeviceAuth = useAuthStore((s) => s.setDeviceAuth);
  const pairMutation = useMutation({
    mutationFn: () => api.verifyDisplayPairing(code),
    onSuccess: (res) => {
      setDeviceAuth(res.deviceToken, res.device.name, res.device.id);
      notify.success('A tablet párosítva', res.device.name);
    },
  });

  return (
    <section className="w-full space-y-5 rounded-lg border border-border bg-card p-6 shadow-sm">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Tablet párosítása</h1>
        <p className="text-sm text-muted-foreground">
          A Monitorok oldalon hozz létre egy „Vendégfelvételi tablet” eszközt, és írd be ide a
          kapott 6 jegyű kódot.
        </p>
      </div>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (code.length === 6) pairMutation.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="tablet-pairing-code">Párosító kód</Label>
          <Input
            id="tablet-pairing-code"
            data-barcode-ignore
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          />
        </div>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={code.length !== 6 || pairMutation.isPending}>
            Párosítás
          </Button>
        </div>
      </form>
    </section>
  );
};
