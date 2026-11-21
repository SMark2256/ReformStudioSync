import { BookableTreatmentDto, BookingStatus, toAppError, walkInStart } from '@reform/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useId, useState } from 'react';
import {
  BOOKING_QUERY_KEYS,
  deductionText,
  formatBookingMoment,
  formatBookingTime,
  passWarningText,
  SlotPicker,
} from '@/entities/booking';
import { GuestPicker } from '@/entities/guest';
import { api, bookingApi } from '@/shared/api';
import { handleAppError } from '@/shared/lib/errors';
import { notify } from '@/shared/lib/notify';
import {
  Button,
  Checkbox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
} from '@/shared/ui';

type StartMode = 'slot' | 'now';

interface NewBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  treatments: BookableTreatmentDto[];
  initialDayKey: string;
}

/** Az aktív kezelések erőforrásonként (gép vagy kozmetikus), a beállított sorrendben. */
function groupByResource(treatments: readonly BookableTreatmentDto[]) {
  const groups = new Map<string, { resourceName: string; treatments: BookableTreatmentDto[] }>();
  for (const t of [...treatments].filter((x) => x.isActive).sort((a, b) => a.sortOrder - b.sortOrder)) {
    const group = groups.get(t.resourceId) ?? { resourceName: t.resourceName, treatments: [] };
    group.treatments.push(t);
    groups.set(t.resourceId, group);
  }
  return [...groups.entries()];
}

/**
 * Új foglalás a recepción: vendég, kezelések (a konfigurált sorrendben), nap és szabad időpont.
 * „Most kezdődik” (TICKET-59): helyben beengedés szabad helyre, a kezdés most (5 percre lefelé
 * kerekítve); a 30 perces határ nem köti, a nyitvatartás és a kapacitás igen. A foglalás
 * utána azonnal „Megérkezett” lehet, a szokásos levonással.
 */
export const NewBookingDialog: React.FC<NewBookingDialogProps> = ({ open, onOpenChange, treatments, initialDayKey }) => {
  const fieldId = useId();
  const queryClient = useQueryClient();
  const [guestId, setGuestId] = useState('');
  const [treatmentIds, setTreatmentIds] = useState<string[]>([]);
  const [startMode, setStartMode] = useState<StartMode>('slot');
  const [markArrived, setMarkArrived] = useState(true);
  const [dayKey, setDayKey] = useState(initialDayKey);
  const [override, setOverride] = useState(false);
  const [startsAt, setStartsAt] = useState('');
  const [note, setNote] = useState('');
  const walkIn = startMode === 'now';

  useEffect(() => {
    if (!open) return;
    setGuestId('');
    setTreatmentIds([]);
    setStartMode('slot');
    setMarkArrived(true);
    setDayKey(initialDayKey);
    setOverride(false);
    setStartsAt('');
    setNote('');
  }, [open, initialDayKey]);

  const guestsQuery = useQuery({ queryKey: ['guests', 'all'], queryFn: () => api.getGuests(''), enabled: open });
  const availabilityKey = { dayKey, treatmentIds, guestId, override };
  const availability = useQuery({
    queryKey: BOOKING_QUERY_KEYS.availability({ scope: 'staff', ...availabilityKey }),
    queryFn: () => bookingApi.getAvailability({ dayKey, treatmentIds, guestId: guestId || null, override }),
    enabled: open && !walkIn && treatmentIds.length > 0 && Boolean(dayKey),
  });
  const slots = availability.data?.slots;
  // A választott időpont a lista változásakor is érvényes maradjon, különben törlődik.
  useEffect(() => {
    if (startsAt && slots && !slots.some((s) => s.startsAt === startsAt)) setStartsAt('');
  }, [slots, startsAt]);

  const create = useMutation({
    mutationFn: async () => {
      const result = await bookingApi.createBooking(
        walkIn
          ? { guestId, treatmentIds, walkIn: true, note: note.trim() || undefined }
          : { guestId, treatmentIds, startsAt, overrideRules: override, note: note.trim() || undefined },
      );
      if (!walkIn || !markArrived) return { result, arrivals: [] };
      // A foglalás már rögzült: a megérkezés hibája csak jelzés, a recepció utólag is beállíthatja.
      try {
        const arrivals = [];
        for (const booking of result.bookings) {
          arrivals.push(await bookingApi.setBookingStatus(booking.id, { status: BookingStatus.ARRIVED }));
        }
        return { result, arrivals };
      } catch (err) {
        handleAppError(err, { title: 'A foglalás rögzítve, a megérkezés nem' });
        return { result, arrivals: [] };
      }
    },
    onSuccess: ({ result, arrivals }) => {
      const first = result.bookings[0];
      notify.success(
        walkIn ? `${first.guestName} beengedve` : `${first.guestName} foglalása rögzítve`,
        `${result.bookings.map((b) => b.treatmentName).join(', ')}, ${formatBookingMoment(first.startsAt)}`,
      );
      for (const arrival of arrivals) {
        notify.success(`${arrival.booking.treatmentName}: „Megérkezett”`, deductionText(arrival));
      }
      if (arrivals.length === 0) {
        for (const w of result.warnings) notify.warning(`${w.treatmentName}: bérlet`, passWarningText(w.warning));
      }
      void queryClient.invalidateQueries({ queryKey: BOOKING_QUERY_KEYS.all });
      onOpenChange(false);
    },
    onError: (err) => {
      if (toAppError(err).code === 'BOOKING.CAPACITY_FULL') void availability.refetch();
      handleAppError(err, { title: walkIn ? 'A beengedés nem sikerült' : 'A foglalás nem sikerült' });
    },
  });

  const groups = groupByResource(treatments);
  const toggleTreatment = (id: string, checked: boolean) =>
    setTreatmentIds((current) => (checked ? [...current, id] : current.filter((x) => x !== id)));
  const canSubmit = Boolean(guestId && treatmentIds.length > 0 && (walkIn || startsAt)) && !create.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Új foglalás</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <GuestPicker guests={guestsQuery.data ?? []} value={guestId} onChange={setGuestId} />

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold text-muted-foreground">Kezelések</legend>
            <p className="text-xs text-muted-foreground">Több kezelésnél egymás után, a beállított sorrendben.</p>
            {groups.map(([resourceId, group]) => (
              <fieldset key={resourceId} className="space-y-2">
                <legend className="text-xs font-semibold text-foreground">{group.resourceName}</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {group.treatments.map((t) => (
                    <div key={t.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`${fieldId}-t-${t.id}`}
                        checked={treatmentIds.includes(t.id)}
                        onCheckedChange={(checked) => toggleTreatment(t.id, checked === true)}
                      />
                      <Label htmlFor={`${fieldId}-t-${t.id}`} className="text-[13px] font-normal text-foreground">
                        {t.name} ({t.durationMinutes} perc)
                      </Label>
                    </div>
                  ))}
                </div>
              </fieldset>
            ))}
          </fieldset>

          <div className="space-y-2">
            <h3 id={`${fieldId}-start`} className="text-xs font-semibold text-muted-foreground">
              Kezdés
            </h3>
            <ToggleGroup
              type="single"
              aria-labelledby={`${fieldId}-start`}
              value={startMode}
              onValueChange={(value) => value && setStartMode(value as StartMode)}
              className="flex-wrap"
            >
              <ToggleGroupItem value="slot">Időpont választása</ToggleGroupItem>
              <ToggleGroupItem value="now">Most kezdődik</ToggleGroupItem>
            </ToggleGroup>
          </div>

          {walkIn ? (
            <div className="space-y-3">
              <p className="text-[13px] text-foreground">
                Ma, {formatBookingTime(walkInStart(new Date()).toISOString())} (most, 5 percre kerekítve). A 30 perces
                előfoglalási határ nem vonatkozik rá, de szabad helynek kell lennie, és a kezelésnek a zárásig bele
                kell férnie.
              </p>
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`${fieldId}-arrived`}
                  checked={markArrived}
                  onCheckedChange={(checked) => setMarkArrived(checked === true)}
                />
                <Label htmlFor={`${fieldId}-arrived`} className="text-[13px] font-normal text-foreground">
                  Megérkezett (az alkalom levonása a bérletből)
                </Label>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${fieldId}-day`}>Nap</Label>
                  <Input id={`${fieldId}-day`} type="date" value={dayKey} onChange={(e) => setDayKey(e.target.value)} />
                </div>
                <div className="flex items-center gap-2 sm:pt-6">
                  <Checkbox
                    id={`${fieldId}-override`}
                    checked={override}
                    onCheckedChange={(checked) => setOverride(checked === true)}
                  />
                  <Label htmlFor={`${fieldId}-override`} className="text-[13px] font-normal text-foreground">
                    Időkorlát felülírása (30 nap, 30 perc)
                  </Label>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground">Szabad időpontok</h3>
                {treatmentIds.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">Válassz legalább egy kezelést.</p>
                ) : (
                  <SlotPicker
                    label="Szabad időpontok"
                    slots={slots}
                    loading={availability.isLoading}
                    value={startsAt}
                    onChange={setStartsAt}
                    showRemaining
                    emptyText="Ezen a napon nincs szabad időpont ezekre a kezelésekre."
                  />
                )}
              </div>
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${fieldId}-note`}>Megjegyzés</Label>
            <Textarea id={`${fieldId}-note`} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Mégse
          </Button>
          <Button variant="primary" disabled={!canSubmit} onClick={() => create.mutate()}>
            {walkIn ? 'Beengedés rögzítése' : 'Foglalás rögzítése'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
