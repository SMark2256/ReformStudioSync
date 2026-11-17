import {
  addDaysToDayKey,
  DAY_CLOSED_REASON_LABELS,
  GuestBookingProfileDto,
  PublicContactDto,
  PublicCreateBookingResponseDto,
  toAppError,
} from '@reform/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import React, { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatBookingMoment, formatDayKey, passWarningText, SlotPicker } from '@/entities/booking';
import { bookingApi } from '@/shared/api';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Label,
  Skeleton,
  Textarea,
} from '@/shared/ui';
import { useGuestSession } from '../model/guestSession';
import { GuestLoginForm, GuestProfileCard } from './GuestAccount';
import { PublicLayout } from './PublicLayout';

const PHONE_PATTERN = /^\+?[0-9 ()/-]{7,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPTY_CONTACT: PublicContactDto = { lastName: '', firstName: '', email: '', phone: '' };

function contactErrors(contact: PublicContactDto): Partial<Record<keyof PublicContactDto, string>> {
  return {
    ...(contact.lastName.trim() ? {} : { lastName: 'A vezetéknév megadása kötelező.' }),
    ...(contact.firstName.trim() ? {} : { firstName: 'A keresztnév megadása kötelező.' }),
    ...(EMAIL_PATTERN.test(contact.email.trim()) ? {} : { email: 'Érvényes e-mail címet adj meg.' }),
    ...(PHONE_PATTERN.test(contact.phone.trim()) ? {} : { phone: 'Érvényes telefonszámot adj meg.' }),
  };
}

/**
 * Nyilvános időpontfoglaló (`/foglalas`, TICKET-57): munkatársi belépés nélkül. Foglalás
 * névvel, telefonnal és e-maillel, vagy e-mailes kóddal belépve (bérletek, foglalások).
 */
export const PublicBookingPage: React.FC = () => {
  const fieldId = useId();
  const queryClient = useQueryClient();
  const session = useGuestSession();
  const [profile, setProfile] = useState<GuestBookingProfileDto | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [treatmentIds, setTreatmentIds] = useState<string[]>([]);
  const [dayKey, setDayKey] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [contact, setContact] = useState<PublicContactDto>(EMPTY_CONTACT);
  const [note, setNote] = useState('');
  const [privacy, setPrivacy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<PublicCreateBookingResponseDto | null>(null);
  const [waitlistWindow, setWaitlistWindow] = useState({ from: '07:00', to: '18:00' });
  const [waitlistDone, setWaitlistDone] = useState(false);

  const catalog = useQuery({ queryKey: ['public-booking', 'catalog'], queryFn: () => bookingApi.getPublicCatalog() });
  useEffect(() => {
    if (catalog.data && !dayKey) setDayKey(catalog.data.today);
  }, [catalog.data, dayKey]);

  // A tárolt munkamenethez tartozó profil (lejárt munkamenetnél kilépés).
  const profileQuery = useQuery({
    queryKey: ['public-booking', 'profile', session.token],
    queryFn: () => bookingApi.getGuestProfile(session.token!),
    enabled: Boolean(session.token) && !profile,
    retry: false,
  });
  const { signOut } = session;
  useEffect(() => {
    if (profileQuery.data) setProfile(profileQuery.data);
    if (profileQuery.isError) signOut();
  }, [profileQuery.data, profileQuery.isError, signOut]);

  const availability = useQuery({
    queryKey: ['public-booking', 'availability', dayKey, treatmentIds, session.token],
    queryFn: () => bookingApi.getPublicAvailability(dayKey, treatmentIds, session.token),
    enabled: Boolean(dayKey) && treatmentIds.length > 0,
  });
  const slots = availability.data?.slots;
  useEffect(() => {
    if (startsAt && slots && !slots.some((s) => s.startsAt === startsAt)) setStartsAt('');
  }, [slots, startsAt]);

  const signedIn = Boolean(session.token && profile);
  const errors = signedIn ? {} : contactErrors(contact);
  const valid = Object.keys(errors).length === 0 && privacy && Boolean(startsAt);

  const book = useMutation({
    mutationFn: () =>
      bookingApi.createPublicBooking(
        {
          treatmentIds,
          startsAt,
          contact: signedIn ? undefined : { ...contact, email: contact.email.trim() },
          note: note.trim() || undefined,
          privacyAccepted: privacy,
        },
        signedIn ? session.token : null,
      ),
    onSuccess: (created) => {
      setResult(created);
      void queryClient.invalidateQueries({ queryKey: ['public-booking'] });
      window.scrollTo({ top: 0 });
    },
    onError: (err) => {
      if (toAppError(err).code === 'BOOKING.CAPACITY_FULL') void availability.refetch();
    },
  });

  const joinWaitlist = useMutation({
    mutationFn: () =>
      bookingApi.joinPublicWaitlist(
        {
          treatmentId: treatmentIds[0],
          dayKey,
          fromTime: waitlistWindow.from,
          toTime: waitlistWindow.to,
          contact: signedIn ? undefined : contact,
          privacyAccepted: privacy,
        },
        signedIn ? session.token : null,
      ),
    onSuccess: () => setWaitlistDone(true),
  });

  if (result) {
    return (
      <PublicLayout title="Foglalás rögzítve">
        <Card>
          <CardContent className="space-y-4">
            <p className="text-[13px] text-foreground">
              A visszaigazolást e-mailben is elküldtük. Az időpont előtt 24 órával emlékeztetőt küldünk.
            </p>
            <ul className="divide-y divide-border rounded-md border border-border">
              {result.bookings.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-[13px]">
                  <span className="min-w-0 flex-1 font-medium text-foreground">
                    {formatBookingMoment(b.startsAt)}, {b.treatmentName}
                  </span>
                  <Link className="text-primary-text underline underline-offset-[3px]" to={`/foglalas/kezeles/${b.manageToken}`}>
                    Foglalás kezelése
                  </Link>
                </li>
              ))}
            </ul>
            {result.passWarnings.map((w) => (
              <Alert key={w.treatmentId}>
                {w.treatmentName}: {passWarningText(w.warning)}
              </Alert>
            ))}
            <p className="text-xs text-muted-foreground">
              Online módosítás és lemondás a kezdés előtt legalább {catalog.data?.changeCutoffHours ?? 24} órával
              lehetséges; ezután a recepció tud segíteni.
            </p>
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  setResult(null);
                  setStartsAt('');
                  setSubmitted(false);
                }}
              >
                Újabb foglalás
              </Button>
            </div>
          </CardContent>
        </Card>
      </PublicLayout>
    );
  }

  const data = catalog.data;
  const lastDay = data ? addDaysToDayKey(data.today, data.maxAdvanceDays) : '';
  const day = availability.data?.day;
  const setField = (key: keyof PublicContactDto) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setContact((c) => ({ ...c, [key]: e.target.value }));
  const fieldError = (key: keyof PublicContactDto) =>
    submitted && errors[key] ? (
      <p id={`${fieldId}-${key}-error`} className="text-xs text-destructive">
        {errors[key]}
      </p>
    ) : null;

  return (
    <PublicLayout title="Időpontfoglalás">
      <p className="text-sm text-muted-foreground">
        Válaszd ki a kezeléseket és az időpontot. {data?.locationText}
      </p>

      {catalog.isError && <Alert variant="destructive">A foglaló most nem érhető el. Próbáld újra később.</Alert>}

      {signedIn && profile ? (
        <GuestProfileCard
          profile={profile}
          onSignOut={() => {
            session.signOut();
            setProfile(null);
          }}
        />
      ) : loggingIn ? (
        <GuestLoginForm
          onCancel={() => setLoggingIn(false)}
          onSignedIn={(token, expiresAt, signedInProfile) => {
            session.signIn(token, expiresAt);
            setProfile(signedInProfile);
            setLoggingIn(false);
          }}
        />
      ) : (
        <p className="text-[13px] text-muted-foreground">
          Van már profilod a stúdióban?{' '}
          <Button variant="link" onClick={() => setLoggingIn(true)}>
            Belépés e-mailes kóddal
          </Button>{' '}
          (bérleteid és foglalásaid megtekintése)
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>1. Kezelések</CardTitle>
        </CardHeader>
        <CardContent>
          {!data ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <fieldset className="space-y-2">
              <legend className="sr-only">Kezelések</legend>
              <p className="text-xs text-muted-foreground">Több kezelésnél egymás után következnek.</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {data.treatments.map((t) => (
                  <div key={t.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`${fieldId}-t-${t.id}`}
                      checked={treatmentIds.includes(t.id)}
                      onCheckedChange={(checked) =>
                        setTreatmentIds((ids) => (checked === true ? [...ids, t.id] : ids.filter((x) => x !== t.id)))
                      }
                    />
                    <Label htmlFor={`${fieldId}-t-${t.id}`} className="text-[13px] font-normal text-foreground">
                      {t.name} ({t.durationMinutes} perc)
                    </Label>
                  </div>
                ))}
              </div>
            </fieldset>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Időpont</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <Button
              size="icon"
              aria-label="Előző nap"
              disabled={!data || dayKey <= data.today}
              onClick={() => setDayKey((d) => addDaysToDayKey(d, -1))}
            >
              <ChevronLeft />
            </Button>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${fieldId}-day`}>Nap</Label>
              <Input
                id={`${fieldId}-day`}
                type="date"
                min={data?.today}
                max={lastDay}
                value={dayKey}
                onChange={(e) => e.target.value && setDayKey(e.target.value)}
                className="w-44"
              />
            </div>
            <Button
              size="icon"
              aria-label="Következő nap"
              disabled={!data || dayKey >= lastDay}
              onClick={() => setDayKey((d) => addDaysToDayKey(d, 1))}
            >
              <ChevronRight />
            </Button>
            {dayKey && <span className="pb-2 text-[13px] text-muted-foreground">{formatDayKey(dayKey)}</span>}
          </div>
          {treatmentIds.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Előbb válassz kezelést.</p>
          ) : day && !day.hours ? (
            <p className="text-[13px] text-muted-foreground">
              Ezen a napon zárva vagyunk
              {day.holidayName ? ` (${day.holidayName})` : day.closedReason ? ` (${DAY_CLOSED_REASON_LABELS[day.closedReason].toLowerCase()})` : ''}.
              Válassz másik napot.
            </p>
          ) : (
            <SlotPicker
              label="Szabad időpontok"
              slots={slots}
              loading={availability.isLoading}
              value={startsAt}
              onChange={setStartsAt}
              emptyText="Ezen a napon nincs szabad időpont. Válassz másik napot, vagy jelentkezz a várólistára."
            />
          )}

          {treatmentIds.length === 1 && slots && slots.length === 0 && day?.hours && (
            <section className="space-y-3 rounded-md border border-border p-4">
              <h3 className="text-xs font-semibold text-muted-foreground">Várólista erre a napra</h3>
              {waitlistDone ? (
                <Alert>Felírtunk a várólistára. Ha felszabadul egy hely, e-mailt küldünk, és 30 percig neked tartjuk.</Alert>
              ) : (
                <>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`${fieldId}-wl-from`}>Ettől</Label>
                      <Input
                        id={`${fieldId}-wl-from`}
                        type="time"
                        value={waitlistWindow.from}
                        onChange={(e) => setWaitlistWindow((w) => ({ ...w, from: e.target.value }))}
                        className="w-28"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`${fieldId}-wl-to`}>Eddig</Label>
                      <Input
                        id={`${fieldId}-wl-to`}
                        type="time"
                        value={waitlistWindow.to}
                        onChange={(e) => setWaitlistWindow((w) => ({ ...w, to: e.target.value }))}
                        className="w-28"
                      />
                    </div>
                    <Button
                      disabled={joinWaitlist.isPending || (!signedIn && (Object.keys(errors).length > 0 || !privacy))}
                      onClick={() => joinWaitlist.mutate()}
                    >
                      Jelentkezés a várólistára
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Ehhez is kitöltött adatok és az adatkezelési tájékoztató elfogadása kell (lent).
                  </p>
                  {joinWaitlist.isError && <Alert variant="destructive">{toAppError(joinWaitlist.error).message}</Alert>}
                </>
              )}
            </section>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Adatok és véglegesítés</CardTitle>
        </CardHeader>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
            if (valid) book.mutate();
          }}
        >
          <CardContent className="space-y-4">
            {signedIn && profile ? (
              <p className="text-[13px] text-foreground">
                Foglalás {profile.lastName} {profile.firstName} ({profile.email}) nevére.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {(
                  [
                    ['lastName', 'Vezetéknév', 'family-name', 'text'],
                    ['firstName', 'Keresztnév', 'given-name', 'text'],
                    ['email', 'E-mail cím', 'email', 'email'],
                    ['phone', 'Telefonszám', 'tel', 'tel'],
                  ] as const
                ).map(([key, label, autoComplete, type]) => (
                  <div key={key} className="flex flex-col gap-1.5">
                    <Label htmlFor={`${fieldId}-${key}`}>{label}</Label>
                    <Input
                      id={`${fieldId}-${key}`}
                      type={type}
                      autoComplete={autoComplete}
                      value={contact[key]}
                      onChange={setField(key)}
                      aria-invalid={submitted && Boolean(errors[key])}
                      aria-describedby={submitted && errors[key] ? `${fieldId}-${key}-error` : undefined}
                    />
                    {fieldError(key)}
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${fieldId}-note`}>Megjegyzés (nem kötelező)</Label>
              <Textarea id={`${fieldId}-note`} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id={`${fieldId}-privacy`}
                checked={privacy}
                onCheckedChange={(checked) => setPrivacy(checked === true)}
                aria-invalid={submitted && !privacy}
              />
              <Label htmlFor={`${fieldId}-privacy`} className="text-[13px] font-normal leading-5 text-foreground">
                Elfogadom az adatkezelési tájékoztatót: az adataimat a stúdió a foglalás kezeléséhez használja.
              </Label>
            </div>
            {submitted && !privacy && <p className="text-xs text-destructive">A foglaláshoz el kell fogadni az adatkezelési tájékoztatót.</p>}
            {submitted && !startsAt && <p className="text-xs text-destructive">Válassz időpontot.</p>}
            <p className="text-xs text-muted-foreground">
              Online módosítás és lemondás a kezdés előtt legalább {data?.changeCutoffHours ?? 24} órával lehetséges;
              ezután a recepció tud segíteni.
            </p>
            {book.isError && <Alert variant="destructive">{toAppError(book.error).message}</Alert>}
            <div className="flex justify-end">
              <Button type="submit" variant="primary" disabled={book.isPending}>
                Foglalás véglegesítése
              </Button>
            </div>
          </CardContent>
        </form>
      </Card>
    </PublicLayout>
  );
};
