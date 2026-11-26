import {
  GuestDto,
  PassTemplateDto,
  PassType,
  PaymentMethod,
  womenOnlyAccess,
} from '@reform/shared';
import { Banknote, Building2, CreditCard } from 'lucide-react';
import React, { useEffect, useId, useRef, useState } from 'react';
import { GuestPicker } from '@/entities/guest';
import {
  Alert,
  AlertDescription,
  Button,
  Checkbox,
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
} from '@/shared/ui';
import { cn } from '@/shared/lib/utils';

// Választható elem (bérlet, fizetési mód): `secondary` gomb, a kijelölt `aria-pressed`, halvány
// kiemelő háttérrel. A mentés csak a `primary` gombbal történik.
const optionClassName =
  'h-auto whitespace-normal coarse:h-auto coarse:min-h-11 aria-pressed:border-primary aria-pressed:bg-primary-soft';

const PAYMENT_METHODS = [
  { id: PaymentMethod.POS_CARD, label: 'Bankkártya (POS)', icon: CreditCard },
  { id: PaymentMethod.CASH, label: 'Készpénz', icon: Banknote },
  { id: PaymentMethod.BANK_TRANSFER, label: 'Átutalás', icon: Building2 },
];

interface SellPassModalProps {
  isOpen: boolean;
  /** Előre kiválasztott vendég (profilból, vendéglistából, beléptetésből); a modálban módosítható. */
  initialGuest: GuestDto | null;
  guests: GuestDto[];
  templates: PassTemplateDto[];
  preselectedTemplateId?: string | null;
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirmSell: (data: {
    guestId: string;
    passTemplateId: string;
    paymentMethod: PaymentMethod;
    customAmount?: number;
    /** Részletfizetés (TICKET-14): most fizetett összeg; a különbözet a bérlet hátraléka. */
    paidAmount?: number;
    note?: string;
  }) => void;
}

export const SellPassModal: React.FC<SellPassModalProps> = ({
  isOpen,
  initialGuest,
  guests,
  templates,
  preselectedTemplateId,
  isSubmitting = false,
  onClose,
  onConfirmSell,
}) => {
  const noteId = useId();
  const templatesLabelId = useId();
  const methodsLabelId = useId();
  const guestHintId = useId();
  const installmentId = useId();
  const [selectedGuestId, setSelectedGuestId] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    PaymentMethod.POS_CARD,
  );
  const [note, setNote] = useState<string>('');
  const [isInstallment, setIsInstallment] = useState(false);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [showPaidError, setShowPaidError] = useState(false);
  const paidInputRef = useRef<HTMLInputElement>(null);

  // Az előre kiválasztott vendég akkor is választható, ha a lista (még) nem tartalmazza.
  const guestOptions =
    initialGuest && !guests.some((g) => g.id === initialGuest.id)
      ? [initialGuest, ...guests]
      : guests;
  const selectedGuest =
    guestOptions.find((g) => g.id === selectedGuestId) ?? null;

  const activeTemplates = templates.filter((t) => t.isActive);
  // Csak nőknek szóló bérlet férfi vendégnek nem adható el (TICKET-42, a szerver is ellenőrzi).
  const sellableFor = (guest: GuestDto | null) =>
    activeTemplates.filter(
      (t) => womenOnlyAccess(guest?.gender, t.womenOnly) !== 'DENIED',
    );
  const sellableTemplates = sellableFor(selectedGuest);
  const isBlocked = (tpl: PassTemplateDto) =>
    !sellableTemplates.some((t) => t.id === tpl.id);

  useEffect(() => {
    if (!isOpen) return;
    const initialSellable = sellableFor(initialGuest);
    setSelectedGuestId(initialGuest?.id ?? '');
    setSelectedTemplateId(
      initialSellable.find((t) => t.id === preselectedTemplateId)?.id ??
        initialSellable[0]?.id ??
        '',
    );
    setNote('');
    setIsInstallment(false);
    setShowPaidError(false);
  }, [isOpen, preselectedTemplateId, templates, initialGuest?.id]);

  // Másik vendégnél a kijelölt bérlet marad, ha neki is eladható.
  useEffect(() => {
    setSelectedTemplateId((current) =>
      sellableTemplates.some((t) => t.id === current)
        ? current
        : (sellableTemplates[0]?.id ?? ''),
    );
  }, [selectedGuestId]);

  if (!isOpen) return null;

  const selectedTemplate = sellableTemplates.find(
    (t) => t.id === selectedTemplateId,
  );
  const genderMissing =
    !!selectedGuest &&
    !!selectedTemplate &&
    womenOnlyAccess(selectedGuest.gender, selectedTemplate.womenOnly) ===
      'GENDER_MISSING';

  // A most fizetett rész legalább 1 Ft, és legfeljebb a bérlet ára (a szerver is ellenőrzi).
  const price = selectedTemplate?.price ?? 0;
  const isValidPaid =
    Number.isInteger(paidAmount) && paidAmount >= 1 && paidAmount <= price;
  const paidInvalid = isInstallment && showPaidError && !isValidPaid;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGuest || !selectedTemplate) return;
    if (isInstallment && !isValidPaid) {
      setShowPaidError(true);
      paidInputRef.current?.focus();
      return;
    }
    onConfirmSell({
      guestId: selectedGuest.id,
      passTemplateId: selectedTemplateId,
      paymentMethod,
      paidAmount: isInstallment ? paidAmount : undefined,
      note: note.trim() || undefined,
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Bérletértékesítés & Kassza Rögzítés</DialogTitle>
          <DialogDescription>
            {selectedGuest
              ? `Vendég: ${selectedGuest.lastName} ${selectedGuest.firstName} (${selectedGuest.barcode})`
              : 'Válaszd ki a vendéget, a bérlettípust és a fizetési módot.'}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogBody className="space-y-5">
            <div className="flex flex-col gap-1.5">
              <GuestPicker
                guests={guestOptions}
                value={selectedGuestId}
                onChange={setSelectedGuestId}
                describedBy={selectedGuest ? undefined : guestHintId}
              />
              {!selectedGuest && (
                <p id={guestHintId} className="text-xs text-muted-foreground">
                  Bérlet csak kiválasztott vendégnek adható el. Keresd meg a
                  vendéget, és kattints a nevére.
                </p>
              )}
            </div>

            <div role="group" aria-labelledby={templatesLabelId}>
              <h3
                id={templatesLabelId}
                className="mb-2 text-xs font-semibold text-muted-foreground"
              >
                Bérlettípus
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {activeTemplates.map((tpl) => (
                  <Button
                    key={tpl.id}
                    variant="secondary"
                    aria-pressed={tpl.id === selectedTemplateId}
                    disabled={isBlocked(tpl)}
                    onClick={() => setSelectedTemplateId(tpl.id)}
                    className={`${optionClassName} flex-col items-start gap-1 p-3 text-left`}
                  >
                    <span className="text-[13px] font-semibold text-foreground">
                      {tpl.name}
                    </span>
                    {isBlocked(tpl) && (
                      <span className="text-xs font-normal text-muted-foreground">
                        Csak nőknek, férfi vendégnek nem adható el
                      </span>
                    )}
                    <span className="text-xs font-normal text-muted-foreground">
                      {tpl.type === PassType.DAY_TICKET
                        ? 'Napijegy: 1 alkalom, a vásárlás napján zárásig érvényes'
                        : `${
                            tpl.type === PassType.TIME_BASED
                              ? 'Korlátlan belépés'
                              : `${tpl.totalPasses} alkalom`
                          }, ${tpl.durationDays} napig érvényes`}
                    </span>
                    <span className="text-[13px] font-semibold tabular-nums text-foreground">
                      {tpl.price.toLocaleString('hu-HU')} Ft
                    </span>
                  </Button>
                ))}
              </div>
            </div>

            {genderMissing && (
              <Alert>
                <AlertDescription>
                  Ez a bérlet csak nőknek szól, de a vendég neme nincs megadva.
                  Pótold a vendégadatlapon.
                </AlertDescription>
              </Alert>
            )}

            <div role="group" aria-labelledby={methodsLabelId}>
              <h3
                id={methodsLabelId}
                className="mb-2 text-xs font-semibold text-muted-foreground"
              >
                Fizetési mód
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {PAYMENT_METHODS.map((m) => {
                  const Icon = m.icon;
                  return (
                    <Button
                      key={m.id}
                      variant="secondary"
                      aria-pressed={paymentMethod === m.id}
                      onClick={() => setPaymentMethod(m.id)}
                      className={optionClassName}
                    >
                      <Icon aria-hidden strokeWidth={1.75} />
                      {m.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id={installmentId}
                  checked={isInstallment}
                  onCheckedChange={(checked) => {
                    setIsInstallment(checked === true);
                    setPaidAmount(Math.floor(price / 2));
                    setShowPaidError(false);
                  }}
                />
                <Label
                  htmlFor={installmentId}
                  className="text-[13px] font-normal text-foreground"
                >
                  Részletfizetés (most csak egy részt fizet)
                </Label>
              </div>
              {isInstallment && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${installmentId}-paid`}>
                    Most fizetett összeg (Ft)
                  </Label>
                  <Input
                    ref={paidInputRef}
                    id={`${installmentId}-paid`}
                    type="number"
                    min={1}
                    max={price}
                    required
                    data-barcode-ignore
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(Number(e.target.value))}
                    aria-invalid={paidInvalid}
                    aria-describedby={`${installmentId}-paid-hint`}
                    className="tabular-nums"
                  />
                  <span
                    id={`${installmentId}-paid-hint`}
                    className={cn(
                      'text-xs',
                      paidInvalid ? 'text-destructive' : 'text-muted-foreground',
                    )}
                  >
                    {paidInvalid
                      ? `A most fizetett összeg 1 és ${price.toLocaleString('hu-HU')} Ft közötti egész szám legyen.`
                      : 'A ki nem fizetett rész hátralékként a bérlethez kerül, és a vendég adatlapján látszik.'}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={noteId}>Megjegyzés (nem kötelező)</Label>
              <Input
                id={noteId}
                data-barcode-ignore
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Pl. bérletmegújítás, ajándékutalvány"
              />
            </div>
          </DialogBody>

          <DialogFooter>
            <DialogSummary
              label={isInstallment ? 'Most fizetendő' : 'Fizetendő végösszeg'}
              value={`${(isInstallment ? paidAmount : price).toLocaleString('hu-HU')} Ft`}
            />
            <Button variant="secondary" onClick={onClose}>
              Mégse
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting || !selectedGuest || !selectedTemplate}
              aria-describedby={selectedGuest ? undefined : guestHintId}
            >
              {isSubmitting ? 'Rögzítés...' : 'Bérlet Eladása & Fizetés'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
