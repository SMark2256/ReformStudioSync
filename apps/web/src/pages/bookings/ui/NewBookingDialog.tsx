import { BookableTreatmentDto, toAppError } from '@reform/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useId, useState } from 'react';
import { BOOKING_QUERY_KEYS, formatBookingMoment, passWarningText, SlotPicker } from '@/entities/booking';
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
} from '@/shared/ui';

interface NewBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  treatments: BookableTreatmentDto[];
  initialDayKey: string;
}

/** Új foglalás a recepción: vendég, kezelések (a konfigurált sorrendben), nap és szabad időpont. */
export const NewBookingDialog: React.FC<NewBookingDialogProps> = ({ open, onOpenChange, treatments, initialDayKey }) => {
  const fieldId = useId();
  const queryClient = useQueryClient();
  const [guestId, setGuestId] = useState('');
  const [treatmentIds, setTreatmentIds] = useState<string[]>([]);
  const [dayKey, setDayKey] = useState(initialDayKey);
  const [override, setOverride] = useState(false);
  const [startsAt, setStartsAt] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setGuestId('');
    setTreatmentIds([]);
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
    enabled: open && treatmentIds.length > 0 && Boolean(dayKey),
  });
  const slots = availability.data?.slots;
  // A választott időpont a lista változásakor is érvényes maradjon, különben törlődik.
  useEffect(() => {
    if (startsAt && slots && !slots.some((s) => s.startsAt === startsAt)) setStartsAt('');
  }, [slots, startsAt]);

  const create = useMutation({
    mutationFn: () =>
      bookingApi.createBooking({ guestId, treatmentIds, startsAt, overrideRules: override, note: note.trim() || undefined }),
    onSuccess: (result) => {
      const first = result.bookings[0];
      notify.success(
        `${first.guestName} foglalása rögzítve`,
        `${result.bookings.map((b) => b.treatmentName).join(', ')}, ${formatBookingMoment(first.startsAt)}`,
      );
      for (const w of result.warnings) notify.warning(`${w.treatmentName}: bérlet`, passWarningText(w.warning));
      void queryClient.invalidateQueries({ queryKey: BOOKING_QUERY_KEYS.all });
      onOpenChange(false);
    },
    onError: (err) => {
      if (toAppError(err).code === 'BOOKING.CAPACITY_FULL') void availability.refetch();
      handleAppError(err, { title: 'A foglalás nem sikerült' });
    },
  });

  const activeTreatments = treatments.filter((t) => t.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const toggleTreatment = (id: string, checked: boolean) =>
    setTreatmentIds((current) => (checked ? [...current, id] : current.filter((x) => x !== id)));
  const canSubmit = Boolean(guestId && treatmentIds.length > 0 && startsAt) && !create.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Új foglalás</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-5">
          <GuestPicker guests={guestsQuery.data ?? []} value={guestId} onChange={setGuestId} />

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-muted-foreground">Kezelések</legend>
            <p className="text-xs text-muted-foreground">Több kezelésnél egymás után, a beállított sorrendben.</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {activeTreatments.map((t) => (
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
            Foglalás rögzítése
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
