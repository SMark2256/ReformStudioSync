import { GuestBookingProfileDto, PassType, toAppError } from '@reform/shared';
import { useMutation } from '@tanstack/react-query';
import React, { useId, useState } from 'react';
import { BookingStatusBadge, formatBookingMoment } from '@/entities/booking';
import { formatShortDate, PASS_STATUS_BADGE } from '@/entities/guest';
import { bookingApi } from '@/shared/api';
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@/shared/ui';

/** Belépés e-mailben kapott 6 jegyű kóddal: előbb a cím, utána a kód. */
export const GuestLoginForm: React.FC<{
  onSignedIn: (token: string, expiresAt: string, profile: GuestBookingProfileDto) => void;
  onCancel: () => void;
}> = ({ onSignedIn, onCancel }) => {
  const fieldId = useId();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [demoCode, setDemoCode] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  const request = useMutation({
    mutationFn: () => bookingApi.requestGuestCode(email.trim()),
    onSuccess: (result) => {
      setSentTo(email.trim());
      setDemoCode(result.demoCode);
      setError(null);
    },
    onError: (err) => setError(toAppError(err).message),
  });
  const verify = useMutation({
    mutationFn: () => bookingApi.verifyGuestCode(sentTo!, code.trim()),
    onSuccess: (result) => onSignedIn(result.guestToken, result.expiresAt, result.profile),
    onError: (err) => setError(toAppError(err).message),
  });

  return (
    <div className="space-y-4 rounded-md border border-border p-4">
      {!sentTo ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            request.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${fieldId}-email`}>E-mail cím, amivel a stúdióban nyilvántartanak</Label>
            <Input
              id={`${fieldId}-email`}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" onClick={onCancel}>
              Mégse
            </Button>
            <Button type="submit" variant="primary" disabled={!email.trim() || request.isPending}>
              Kód küldése
            </Button>
          </div>
        </form>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            verify.mutate();
          }}
        >
          <p className="text-[13px] text-muted-foreground">
            Ha a(z) {sentTo} címmel szerepelsz nálunk, küldtünk rá egy 6 jegyű kódot. 10 percig érvényes.
          </p>
          {demoCode && (
            <Alert>
              Demó mód, nem megy ki levél. A belépőkód: <strong>{demoCode}</strong>
            </Alert>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${fieldId}-code`}>Belépőkód</Label>
            <Input
              id={`${fieldId}-code`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="w-32 tracking-widest"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" onClick={() => setSentTo(null)}>
              Másik cím
            </Button>
            <Button type="submit" variant="primary" disabled={code.length !== 6 || verify.isPending}>
              Belépés
            </Button>
          </div>
        </form>
      )}
      {error && <Alert variant="destructive">{error}</Alert>}
    </div>
  );
};

/** A bejelentkezett vendég bérletei (fennmaradó alkalom, lejárat) és foglalásai. */
export const GuestProfileCard: React.FC<{ profile: GuestBookingProfileDto; onSignOut: () => void }> = ({
  profile,
  onSignOut,
}) => (
  <Card>
    <CardHeader>
      <CardTitle>
        {profile.lastName} {profile.firstName}
      </CardTitle>
      <Button variant="link" onClick={onSignOut}>
        Kilépés
      </Button>
    </CardHeader>
    <CardContent className="space-y-5">
      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground">Bérleteim</h3>
        {profile.passes.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Nincs nyilvántartott bérleted.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {profile.passes.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-[13px]">
                <span className="min-w-0 flex-1 font-medium text-foreground">{p.name}</span>
                <span className="text-muted-foreground">
                  {p.type === PassType.TIME_BASED ? 'korlátlan' : `${p.remainingPasses ?? 0} alkalom maradt`}, lejár:{' '}
                  {formatShortDate(p.expirationDate)}
                </span>
                <Badge variant={PASS_STATUS_BADGE[p.status].variant}>{PASS_STATUS_BADGE[p.status].label}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground">Foglalásaim</h3>
        {profile.bookings.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Még nincs foglalásod.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {profile.bookings.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-[13px]">
                <span className="min-w-0 flex-1 text-foreground">
                  {formatBookingMoment(b.startsAt)}, {b.treatmentName}
                </span>
                <BookingStatusBadge status={b.status} />
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Módosításhoz és lemondáshoz a visszaigazoló levélben kapott linket használd.
        </p>
      </section>
    </CardContent>
  </Card>
);
