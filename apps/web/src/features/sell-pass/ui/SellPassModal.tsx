import {
  GuestDto,
  PassTemplateDto,
  PassType,
  PaymentMethod,
  womenOnlyAccess,
} from '@reform/shared';
import { Banknote, Building2, CreditCard } from 'lucide-react';
import React, { useEffect, useId, useState } from 'react';
import { GuestPicker } from '@/entities/guest';
import {
  Alert,
  AlertDescription,
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
} from '@/shared/ui';

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
  const [selectedGuestId, setSelectedGuestId] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    PaymentMethod.POS_CARD,
  );
  const [note, setNote] = useState<string>('');

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGuest || !selectedTemplate) return;
    onConfirmSell({
      guestId: selectedGuest.id,
      passTemplateId: selectedTemplateId,
      paymentMethod,
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

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
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
                      {tpl.type === PassType.TIME_BASED
                        ? 'Korlátlan belépés'
                        : `${tpl.totalPasses} alkalom`}
                      , {tpl.durationDays} napig érvényes
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
              label="Fizetendő végösszeg"
              value={`${(selectedTemplate?.price ?? 0).toLocaleString('hu-HU')} Ft`}
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
