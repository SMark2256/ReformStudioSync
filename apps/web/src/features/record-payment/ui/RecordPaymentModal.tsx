import { GuestDto, MembershipDueStatus, PaymentMethod } from '@reform/shared';
import React, { useEffect, useId, useRef, useState } from 'react';
import { GuestPicker } from '@/entities/guest';
import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogSummary,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ToggleGroup,
  ToggleGroupItem,
} from '@/shared/ui';
import { cn } from '@/shared/lib/utils';

type TargetType = 'DUE' | 'PASS' | 'CUSTOM';

const PAYMENT_METHODS = [
  { id: PaymentMethod.CASH, label: 'Készpénz' },
  { id: PaymentMethod.POS_CARD, label: 'Bankkártya' },
  { id: PaymentMethod.BANK_TRANSFER, label: 'Átutalás' },
];

const fieldGroupClassName = 'flex flex-col gap-1.5';

const isValidAmount = (amountHuf: number) =>
  Number.isInteger(amountHuf) && amountHuf >= 1;

interface RecordPaymentModalProps {
  isOpen: boolean;
  initialGuest: GuestDto | null;
  guests: GuestDto[];
  preselectedDueId?: string | null;
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirmPayment: (data: {
    guestId: string;
    amountHuf: number;
    paymentMethod: PaymentMethod;
    membershipDueId?: string | null;
    passId?: string | null;
    note?: string;
  }) => void;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  initialGuest,
  guests,
  preselectedDueId,
  isSubmitting = false,
  onClose,
  onConfirmPayment,
}) => {
  const fieldId = useId();
  const [selectedGuestId, setSelectedGuestId] = useState<string>('');
  const [targetType, setTargetType] = useState<TargetType>('DUE');
  const [selectedDueId, setSelectedDueId] = useState<string>('');
  const [selectedPassId, setSelectedPassId] = useState<string>('');
  const [amountHuf, setAmountHuf] = useState<number>(22000);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    PaymentMethod.CASH,
  );
  const [note, setNote] = useState<string>('');
  const [showAmountError, setShowAmountError] = useState(false);
  const amountInputRef = useRef<HTMLInputElement>(null);

  const selectedGuest = guests.find((g) => g.id === selectedGuestId) ?? null;

  const openDues = (selectedGuest?.memberships ?? []).flatMap((m) =>
    (m.dues ?? []).filter(
      (d) =>
        d.status === MembershipDueStatus.PENDING ||
        d.status === MembershipDueStatus.PARTIAL,
    ),
  );

  useEffect(() => {
    if (!isOpen) return;
    const g = initialGuest ?? guests[0] ?? null;
    setSelectedGuestId(g?.id ?? '');
    setNote('');
    setShowAmountError(false);
  }, [isOpen, initialGuest]);

  useEffect(() => {
    if (!selectedGuest) return;
    const dues = (selectedGuest.memberships ?? []).flatMap((m) =>
      (m.dues ?? []).filter(
        (d) =>
          d.status === MembershipDueStatus.PENDING ||
          d.status === MembershipDueStatus.PARTIAL,
      ),
    );
    const chosenDue =
      dues.find((d) => d.id === preselectedDueId) ?? dues[0] ?? null;

    if (chosenDue) {
      setTargetType('DUE');
      setSelectedDueId(chosenDue.id);
      setAmountHuf(chosenDue.remainingHuf);
    } else if ((selectedGuest.passes ?? []).length > 0) {
      setTargetType('PASS');
      setSelectedPassId(selectedGuest.passes![0].id);
      setAmountHuf(22000);
    } else {
      setTargetType('CUSTOM');
      setAmountHuf(22000);
    }
  }, [selectedGuestId, preselectedDueId]);

  if (!isOpen) return null;

  const amountInvalid = showAmountError && !isValidAmount(amountHuf);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidAmount(amountHuf)) {
      setShowAmountError(true);
      amountInputRef.current?.focus();
      return;
    }
    if (!selectedGuestId) return;

    onConfirmPayment({
      guestId: selectedGuestId,
      amountHuf,
      paymentMethod,
      membershipDueId: targetType === 'DUE' ? selectedDueId || null : null,
      passId: targetType === 'PASS' ? selectedPassId || null : null,
      note: note.trim() || undefined,
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Befizetés rögzítése</DialogTitle>
          <DialogDescription>
            Készpénz, bankkártya vagy átutalás hozzárendelése havi tagdíjhoz
            vagy bérlethez.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-4">
            <GuestPicker
              guests={guests}
              value={selectedGuestId}
              onChange={setSelectedGuestId}
            />

            <div className={fieldGroupClassName}>
              <span
                id={`${fieldId}-target`}
                className="text-xs font-semibold text-muted-foreground"
              >
                A befizetés célja
              </span>
              <ToggleGroup
                type="single"
                aria-labelledby={`${fieldId}-target`}
                value={targetType}
                onValueChange={(value) =>
                  value && setTargetType(value as TargetType)
                }
              >
                <ToggleGroupItem value="DUE">
                  Tagdíj ({openDues.length})
                </ToggleGroupItem>
                <ToggleGroupItem value="PASS">Bérlet</ToggleGroupItem>
                <ToggleGroupItem value="CUSTOM">Egyéb</ToggleGroupItem>
              </ToggleGroup>
            </div>

            {targetType === 'DUE' &&
              (openDues.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  Ennek a vendégnek nincs nyitott havi tagdíja.
                </p>
              ) : (
                <div className={fieldGroupClassName}>
                  <Label htmlFor={`${fieldId}-due`}>Tagdíj</Label>
                  <Select
                    value={selectedDueId}
                    onValueChange={(value) => {
                      setSelectedDueId(value);
                      const d = openDues.find((x) => x.id === value);
                      if (d) setAmountHuf(d.remainingHuf);
                    }}
                  >
                    <SelectTrigger id={`${fieldId}-due`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {openDues.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.period} havi tagdíj, hátralék:{' '}
                          {d.remainingHuf.toLocaleString('hu-HU')} Ft (összesen:{' '}
                          {d.amountHuf.toLocaleString('hu-HU')} Ft)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}

            {targetType === 'PASS' && (
              <div className={fieldGroupClassName}>
                <Label htmlFor={`${fieldId}-pass`}>Bérlet</Label>
                <Select
                  value={selectedPassId}
                  onValueChange={setSelectedPassId}
                >
                  <SelectTrigger id={`${fieldId}-pass`}>
                    <SelectValue placeholder="Válassz bérletet" />
                  </SelectTrigger>
                  <SelectContent>
                    {(selectedGuest?.passes ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.passTemplateName} (
                        {new Date(p.createdAt).toLocaleDateString('hu-HU')})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className={fieldGroupClassName}>
                <Label htmlFor={`${fieldId}-amount`}>
                  Fizetett összeg (Ft)
                </Label>
                {/* Az ellenőrzést az `isValidAmount` végzi (`noValidate`); a `min` és a `required`
                    csak a léptetőnek és a felolvasónak szól. Lépésköz nincs: bármely egész Ft jó. */}
                <Input
                  ref={amountInputRef}
                  id={`${fieldId}-amount`}
                  type="number"
                  min={1}
                  required
                  value={amountHuf}
                  onChange={(e) => setAmountHuf(Number(e.target.value))}
                  aria-invalid={amountInvalid}
                  aria-describedby={`${fieldId}-amount-hint`}
                  className="tabular-nums"
                />
                <span
                  id={`${fieldId}-amount-hint`}
                  className={cn(
                    'text-xs',
                    amountInvalid ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {amountInvalid
                    ? 'A fizetett összeg legalább 1 Ft-os egész szám legyen. Add meg a befizetett összeget.'
                    : 'Részbefizetés és túlfizetés is rögzíthető.'}
                </span>
              </div>

              <div className={fieldGroupClassName}>
                <Label htmlFor={`${fieldId}-note`}>Megjegyzés</Label>
                <Input
                  id={`${fieldId}-note`}
                  data-barcode-ignore
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Pl. havi tagdíj, részbefizetés"
                />
              </div>
            </div>

            <div className={fieldGroupClassName}>
              <span
                id={`${fieldId}-method`}
                className="text-xs font-semibold text-muted-foreground"
              >
                Fizetési mód
              </span>
              <ToggleGroup
                type="single"
                aria-labelledby={`${fieldId}-method`}
                value={paymentMethod}
                onValueChange={(value) =>
                  value && setPaymentMethod(value as PaymentMethod)
                }
              >
                {PAYMENT_METHODS.map((m) => (
                  <ToggleGroupItem key={m.id} value={m.id}>
                    {m.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </DialogBody>

          <DialogFooter>
            <DialogSummary
              label="Rögzítendő összeg"
              value={`${amountHuf.toLocaleString('hu-HU')} Ft`}
            />
            <Button variant="secondary" onClick={onClose}>
              Mégse
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Rögzítés...' : 'Befizetés rögzítése'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
