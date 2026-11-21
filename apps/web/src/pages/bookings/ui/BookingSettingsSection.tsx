import {
  BookableTreatmentDto,
  BookingDto,
  BookingSettingsBundleDto,
  BookingSettingsDto,
  DayHours,
  DEFAULT_OPENING_HOURS,
  formatTimeOfDay,
  lastStartOf,
  parseTimeOfDay,
} from '@reform/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp } from 'lucide-react';
import React, { useEffect, useId, useState } from 'react';
import { BOOKING_QUERY_KEYS, formatBookingMoment, formatDayKey } from '@/entities/booking';
import { bookingApi } from '@/shared/api';
import { handleAppError } from '@/shared/lib/errors';
import { notify } from '@/shared/lib/notify';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardActions,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Checkbox,
  ConfirmActionButton,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch,
} from '@/shared/ui';
import { localInputToIso } from '../model/dateInput';

const WEEKDAY_NAMES = ['Hétfő', 'Kedd', 'Szerda', 'Csütörtök', 'Péntek', 'Szombat', 'Vasárnap'];
const STUDIO_WIDE = 'studio';

type NumberSetting = 'maxAdvanceDays' | 'minLeadMinutes' | 'changeCutoffHours' | 'holdMinutes';

/** Új nyitvatartási nap: a hétköznapi alapértelmezés (07:00–19:00, utolsó kezdés 18:00). */
const DEFAULT_DAY_HOURS = DEFAULT_OPENING_HOURS[0]!;

/** A nap hibája, vagy `null`: a nyitás a zárás előtt, az utolsó kezdés a kettő között. */
function dayHoursError(hours: DayHours): string | null {
  if (hours.opensAt >= hours.closesAt) return 'A zárás a nyitás után legyen.';
  const lastStart = lastStartOf(hours);
  if (lastStart < hours.opensAt || lastStart > hours.closesAt) {
    return 'Az utolsó kezdés a nyitás és a zárás közé essen.';
  }
  return null;
}

const useRefresh = () => {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: BOOKING_QUERY_KEYS.all });
};

/** Foglalási beállítások (TICKET-57): nyitvatartás, korlátok, sorrend, gépek, zárvatartás, ünnepnapok, szinkron. */
export const BookingSettingsSection: React.FC = () => {
  const settings = useQuery({ queryKey: BOOKING_QUERY_KEYS.settings, queryFn: () => bookingApi.getSettings() });
  if (settings.isLoading || !settings.data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  const bundle = settings.data;
  return (
    <div className="space-y-4 md:space-y-6">
      <RulesCard settings={bundle.settings} />
      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <TreatmentsCard treatments={bundle.treatments} />
        <ResourcesCard bundle={bundle} />
      </div>
      <ClosuresCard bundle={bundle} />
      <HolidaysCard bundle={bundle} />
      <SyncCard />
    </div>
  );
};

// ---------------------------------------------------------------------------

const RulesCard: React.FC<{ settings: BookingSettingsDto }> = ({ settings }) => {
  const fieldId = useId();
  const refresh = useRefresh();
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);

  const setDay = (index: number, hours: DayHours | null) =>
    setDraft((d) => ({ ...d, openingHours: d.openingHours.map((h, i) => (i === index ? hours : h)) }));
  const setNumber = (key: NumberSetting, value: string) =>
    setDraft((d): BookingSettingsDto => ({ ...d, [key]: Number(value) }));

  const hoursInvalid = draft.openingHours.some((h) => h && dayHoursError(h));
  const save = useMutation({
    mutationFn: () => bookingApi.updateSettings(draft),
    onSuccess: () => {
      notify.success('Foglalási beállítások mentve');
      refresh();
    },
    onError: (err) => handleAppError(err, { title: 'A mentés nem sikerült' }),
  });

  const numberField = (key: NumberSetting, label: string, min: number, max: number) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`${fieldId}-${key}`}>{label}</Label>
      <Input
        id={`${fieldId}-${key}`}
        type="number"
        min={min}
        max={max}
        value={String(draft[key])}
        onChange={(e) => setNumber(key, e.target.value)}
        className="w-28 text-right tabular-nums"
      />
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nyitvatartás és foglalási szabályok</CardTitle>
        <CardDescription>
          a kezelés legkésőbb az utolsó kezdéskor indul, és a szünettel együtt a zárásig véget ér
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-muted-foreground">Heti nyitvatartás</legend>
          {WEEKDAY_NAMES.map((name, index) => {
            const hours = draft.openingHours[index];
            const error = hours ? dayHoursError(hours) : null;
            const timeField = (key: keyof DayHours, label: string, value: number) => (
              <Input
                type="time"
                aria-label={`${name}, ${label}`}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${fieldId}-hours-error-${index}` : undefined}
                value={formatTimeOfDay(value)}
                onChange={(e) => {
                  const minutes = parseTimeOfDay(e.target.value);
                  if (minutes !== null) setDay(index, { ...hours!, [key]: minutes });
                }}
                className="w-28"
              />
            );
            return (
              <div key={name} className="flex flex-wrap items-center gap-3">
                <div className="flex w-36 items-center gap-2">
                  <Checkbox
                    id={`${fieldId}-open-${index}`}
                    checked={Boolean(hours)}
                    onCheckedChange={(checked) =>
                      setDay(index, checked === true ? { ...DEFAULT_DAY_HOURS } : null)
                    }
                  />
                  <Label htmlFor={`${fieldId}-open-${index}`} className="text-[13px] font-normal text-foreground">
                    {name}
                  </Label>
                </div>
                {hours ? (
                  <>
                    {timeField('opensAt', 'nyitás', hours.opensAt)}
                    <span aria-hidden="true">–</span>
                    {timeField('closesAt', 'zárás', hours.closesAt)}
                    <span className="text-[13px] text-muted-foreground">utolsó kezdés</span>
                    {timeField('lastStartAt', 'utolsó kezdés', lastStartOf(hours))}
                    {error && (
                      <p id={`${fieldId}-hours-error-${index}`} className="w-full text-xs text-destructive">
                        {error}
                      </p>
                    )}
                  </>
                ) : (
                  <span className="text-[13px] text-muted-foreground">Zárva</span>
                )}
              </div>
            );
          })}
        </fieldset>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {numberField('maxAdvanceDays', 'Előre foglalható (nap)', 1, 365)}
          {numberField('minLeadMinutes', 'Legkésőbb előtte (perc)', 0, 1440)}
          {numberField('changeCutoffHours', 'Online módosítás előtte (óra)', 0, 168)}
          {numberField('holdMinutes', 'Várólistás tartás (perc)', 5, 240)}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${fieldId}-step`}>Időpontok rácsa</Label>
            <Select
              value={String(draft.slotStepMinutes)}
              onValueChange={(value) => setDraft((d) => ({ ...d, slotStepMinutes: Number(value) }))}
            >
              <SelectTrigger id={`${fieldId}-step`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[5, 10, 15, 20, 30].map((step) => (
                  <SelectItem key={step} value={String(step)}>
                    {step} percenként
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${fieldId}-location`}>Helyszín a levelekben</Label>
            <Input
              id={`${fieldId}-location`}
              value={draft.locationText}
              maxLength={300}
              onChange={(e) => setDraft((d) => ({ ...d, locationText: e.target.value }))}
            />
          </div>
        </div>
      </CardContent>
      <CardFooter className="justify-end">
        <Button variant="primary" disabled={save.isPending || hoursInvalid} onClick={() => save.mutate()}>
          Mentés
        </Button>
      </CardFooter>
    </Card>
  );
};

// ---------------------------------------------------------------------------

const TreatmentsCard: React.FC<{ treatments: BookableTreatmentDto[] }> = ({ treatments }) => {
  const refresh = useRefresh();
  const reorder = useMutation({
    mutationFn: (ids: string[]) => bookingApi.reorderTreatments(ids),
    onSuccess: refresh,
    onError: (err) => handleAppError(err, { title: 'A sorrend nem változott' }),
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { isActive?: boolean; isOnline?: boolean } }) =>
      bookingApi.updateTreatment(id, patch),
    onSuccess: (t) => {
      notify.success(`${t.name}: ${t.isActive ? (t.isOnline ? 'online is foglalható' : 'csak a recepción foglalható') : 'nem foglalható'}`);
      refresh();
    },
    onError: (err) => handleAppError(err, { title: 'A módosítás nem sikerült' }),
  });

  const move = (index: number, delta: -1 | 1) => {
    const ids = treatments.map((t) => t.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved);
    reorder.mutate(ids);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kezelések és sorrend</CardTitle>
        <CardDescription>több kezelésnél ebben a sorrendben követik egymást</CardDescription>
      </CardHeader>
      <CardContent className="p-0 md:p-0">
        <ol className="divide-y divide-border">
          {treatments.map((t, index) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-5">
              <span className="w-6 text-right text-[13px] tabular-nums text-muted-foreground">{index + 1}.</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-foreground">{t.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t.durationMinutes} perc + {t.bufferMinutes} perc szünet, {t.resourceName}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={t.isOnline}
                  disabled={!t.isActive}
                  aria-label={`${t.name}: online foglalható`}
                  onCheckedChange={(checked) => update.mutate({ id: t.id, patch: { isOnline: checked } })}
                />
                <span className="text-xs text-muted-foreground">Online</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={t.isActive}
                  aria-label={`${t.name}: foglalható`}
                  onCheckedChange={(checked) => update.mutate({ id: t.id, patch: { isActive: checked } })}
                />
                <span className="text-xs text-muted-foreground">Aktív</span>
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  aria-label={`${t.name} feljebb`}
                  disabled={index === 0 || reorder.isPending}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  size="icon"
                  aria-label={`${t.name} lejjebb`}
                  disabled={index === treatments.length - 1 || reorder.isPending}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
};

const ResourcesCard: React.FC<{ bundle: BookingSettingsBundleDto }> = ({ bundle }) => {
  const refresh = useRefresh();
  const update = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => bookingApi.updateResource(id, isActive),
    onSuccess: (r) => {
      notify.success(`${r.name}: ${r.isActive ? 'foglalható' : 'letiltva'}`);
      refresh();
    },
    onError: (err) => handleAppError(err, { title: 'A módosítás nem sikerült' }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Gépek</CardTitle>
        <CardDescription>a kapacitás az egyszerre kezelhető vendégek száma</CardDescription>
      </CardHeader>
      <CardContent className="p-0 md:p-0">
        <ul className="divide-y divide-border">
          {bundle.resources.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3 md:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-foreground">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.capacity} fő egyszerre;{' '}
                  {bundle.treatments.filter((t) => t.resourceId === r.id).map((t) => t.name).join(', ') || 'nincs kezelés'}
                </p>
              </div>
              {!r.isActive && <Badge variant="secondary">Letiltva</Badge>}
              <Switch
                checked={r.isActive}
                aria-label={`${r.name}: foglalható`}
                onCheckedChange={(checked) => update.mutate({ id: r.id, isActive: checked })}
              />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};

// ---------------------------------------------------------------------------

const ClosuresCard: React.FC<{ bundle: BookingSettingsBundleDto }> = ({ bundle }) => {
  const fieldId = useId();
  const refresh = useRefresh();
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [target, setTarget] = useState(STUDIO_WIDE);
  const [reason, setReason] = useState('');
  const [affected, setAffected] = useState<BookingDto[] | null>(null);

  const create = useMutation({
    mutationFn: () => {
      const from = localInputToIso(startsAt);
      const to = localInputToIso(endsAt);
      if (!from || !to) throw new Error('Add meg a zárvatartás kezdetét és végét.');
      return bookingApi.createClosure({
        startsAt: from,
        endsAt: to,
        resourceId: target === STUDIO_WIDE ? null : target,
        reason: reason.trim() || undefined,
      });
    },
    onSuccess: (result) => {
      setAffected(result.affectedBookings);
      notify.success(
        result.closure.resourceId ? `${result.closure.resourceName} letiltva` : 'Rendkívüli zárvatartás rögzítve',
        result.affectedBookings.length > 0
          ? `${result.affectedBookings.length} érintett foglalás: a foglalások nem változtak, egyeztess a vendégekkel.`
          : 'Nincs érintett foglalás.',
      );
      setStartsAt('');
      setEndsAt('');
      setReason('');
      refresh();
    },
    onError: (err) => handleAppError(err, { title: 'A zárvatartás nem rögzült' }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => bookingApi.deleteClosure(id),
    onSuccess: () => {
      notify.success('Zárvatartás törölve');
      refresh();
    },
    onError: (err) => handleAppError(err, { title: 'A törlés nem sikerült' }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rendkívüli zárvatartás és gépletiltás</CardTitle>
        <CardDescription>csak figyelmeztet: a meglévő foglalások nem változnak</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${fieldId}-from`}>Kezdete</Label>
            <Input id={`${fieldId}-from`} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${fieldId}-to`}>Vége</Label>
            <Input id={`${fieldId}-to`} type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${fieldId}-target`}>Érintett</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger id={`${fieldId}-target`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={STUDIO_WIDE}>A teljes stúdió</SelectItem>
                {bundle.resources.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${fieldId}-reason`}>Ok</Label>
            <Input id={`${fieldId}-reason`} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end">
          <Button disabled={!startsAt || !endsAt || create.isPending} onClick={() => create.mutate()}>
            Zárvatartás rögzítése
          </Button>
        </div>

        {affected && affected.length > 0 && (
          <Alert>
            <p className="font-semibold">Érintett foglalások ({affected.length}), nem módosultak:</p>
            <ul className="mt-1 list-disc pl-5">
              {affected.map((b) => (
                <li key={b.id}>
                  {b.guestName}, {b.treatmentName}, {formatBookingMoment(b.startsAt)}
                  {b.guestPhone ? `, ${b.guestPhone}` : ''}
                </li>
              ))}
            </ul>
          </Alert>
        )}

        {bundle.closures.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Nincs rögzített zárvatartás.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {bundle.closures.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-[13px]">
                <span className="min-w-0 flex-1 text-foreground">
                  {formatBookingMoment(c.startsAt)} – {formatBookingMoment(c.endsAt)}
                  <span className="text-muted-foreground">
                    {' '}
                    ({c.resourceName ?? 'teljes stúdió'}
                    {c.reason ? `, ${c.reason}` : ''})
                  </span>
                </span>
                <ConfirmActionButton
                  size="sm"
                  aria-label={`Zárvatartás törlése: ${formatBookingMoment(c.startsAt)}`}
                  confirmLabel="Zárvatartás törlése"
                  description="Az időszak újra foglalható lesz, a várólista ajánlatot kaphat."
                  onConfirm={() => remove.mutate(c.id)}
                >
                  Törlés
                </ConfirmActionButton>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

const HolidaysCard: React.FC<{ bundle: BookingSettingsBundleDto }> = ({ bundle }) => {
  const fieldId = useId();
  const refresh = useRefresh();
  const [closedDay, setClosedDay] = useState('');
  const upsert = useMutation({
    mutationFn: (input: { dayKey: string; isOpen: boolean }) => bookingApi.upsertHolidayOverride(input),
    onSuccess: (o) => {
      notify.success(`${formatDayKey(o.dayKey)}: ${o.isOpen ? 'nyitva' : 'zárva'}`);
      setClosedDay('');
      refresh();
    },
    onError: (err) => handleAppError(err, { title: 'A módosítás nem sikerült' }),
  });
  const remove = useMutation({
    mutationFn: (dayKey: string) => bookingApi.deleteHolidayOverride(dayKey),
    onSuccess: refresh,
    onError: (err) => handleAppError(err, { title: 'A módosítás nem sikerült' }),
  });
  const holidayDays = new Set(bundle.holidays.map((h) => h.dayKey));
  const extraClosed = bundle.holidayOverrides.filter((o) => !o.isOpen && !holidayDays.has(o.dayKey));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Munkaszüneti napok</CardTitle>
        <CardDescription>a magyar ünnepnapok (a húsvéthoz kötöttekkel) számolva; ünnepnapon is nyitható</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <ul className="grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-2">
          {bundle.holidays.map((h) => (
            <li key={h.dayKey} className="flex items-center gap-3 text-[13px]">
              <span className="min-w-0 flex-1 text-foreground">
                {formatDayKey(h.dayKey)} {h.dayKey.slice(0, 4)}: {h.name}
              </span>
              <Switch
                checked={h.isOpen}
                aria-label={`${h.name} (${h.dayKey}): nyitva`}
                onCheckedChange={(checked) =>
                  checked ? upsert.mutate({ dayKey: h.dayKey, isOpen: true }) : remove.mutate(h.dayKey)
                }
              />
              <span className="w-12 text-xs text-muted-foreground">{h.isOpen ? 'Nyitva' : 'Zárva'}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${fieldId}-closed`}>Egy nap zárása</Label>
            <Input id={`${fieldId}-closed`} type="date" value={closedDay} onChange={(e) => setClosedDay(e.target.value)} />
          </div>
          <Button disabled={!closedDay || upsert.isPending} onClick={() => upsert.mutate({ dayKey: closedDay, isOpen: false })}>
            Nap zárása
          </Button>
        </div>
        {extraClosed.length > 0 && (
          <ul className="space-y-1.5 text-[13px]">
            {extraClosed.map((o) => (
              <li key={o.dayKey} className="flex items-center gap-3">
                <span className="text-foreground">{formatDayKey(o.dayKey)} {o.dayKey.slice(0, 4)}: zárva</span>
                <Button variant="link" onClick={() => remove.mutate(o.dayKey)}>
                  Visszanyitás
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

const SyncCard: React.FC = () => {
  const refresh = useRefresh();
  const sync = useQuery({ queryKey: BOOKING_QUERY_KEYS.sync, queryFn: () => bookingApi.getSyncStatus() });
  const retry = useMutation({
    mutationFn: () => bookingApi.retrySync(),
    onSuccess: (r) => {
      notify.success(`${r.retried} tétel újra a sorban`);
      refresh();
    },
    onError: (err) => handleAppError(err, { title: 'Az újrapróbálás nem sikerült' }),
  });
  const status = sync.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Google Naptár szinkron</CardTitle>
        <CardDescription>egyirányú: a Google-ban végzett változtatás nem ír vissza</CardDescription>
        {status?.configured && status.failed > 0 && (
          <CardActions>
            <Button disabled={retry.isPending} onClick={() => retry.mutate()}>
              Újrapróbálás
            </Button>
          </CardActions>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-[13px]">
        {!status ? (
          <Skeleton className="h-6 w-64" />
        ) : !status.configured ? (
          <p className="text-muted-foreground">
            <Badge variant="secondary">Nincs beállítva</Badge> A szinkronhoz a GOOGLE_CALENDAR_ID és a service account
            adatai kellenek a szerveren.
          </p>
        ) : (
          <>
            <p className="text-foreground">
              Várakozik: {status.pending}, hibás: {status.failed}
              {status.lastSyncedAt ? `, utolsó sikeres: ${formatBookingMoment(status.lastSyncedAt)}` : ''}
            </p>
            {status.failures.length > 0 && (
              <Alert variant="destructive">
                <ul className="list-disc pl-5">
                  {status.failures.map((f) => (
                    <li key={f.id}>
                      {f.operation === 'DELETE' ? 'Törlés' : 'Frissítés'}, {f.attempts} próbálkozás: {f.lastError ?? 'ismeretlen hiba'}
                    </li>
                  ))}
                </ul>
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
