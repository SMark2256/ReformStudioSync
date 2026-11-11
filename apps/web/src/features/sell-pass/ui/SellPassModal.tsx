import {
  GuestDto,
  PassTemplateDto,
  PassType,
  PaymentMethod,
} from '@reform/shared';
import { Banknote, Building2, CreditCard } from 'lucide-react';
import React, { useEffect, useId, useState } from 'react';
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
  guest: GuestDto | null;
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
  guest,
  templates,
  preselectedTemplateId,
  isSubmitting = false,
  onClose,
  onConfirmSell,
}) => {
  const noteId = useId();
  const templatesLabelId = useId();
  const methodsLabelId = useId();
  const activeTemplates = templates.filter((t) => t.isActive);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    PaymentMethod.POS_CARD,
  );
  const [note, setNote] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    if (
      preselectedTemplateId &&
      activeTemplates.some((t) => t.id === preselectedTemplateId)
    ) {
      setSelectedTemplateId(preselectedTemplateId);
    } else if (activeTemplates.length > 0) {
      setSelectedTemplateId(activeTemplates[0].id);
    }
    setNote('');
  }, [isOpen, preselectedTemplateId, templates]);

  if (!isOpen || !guest) return null;

  const selectedTemplate = activeTemplates.find(
    (t) => t.id === selectedTemplateId,
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplateId) return;
    onConfirmSell({
      guestId: guest.id,
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
            Vendég: {guest.lastName} {guest.firstName} ({guest.barcode})
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-5">
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
                    onClick={() => setSelectedTemplateId(tpl.id)}
                    className={`${optionClassName} flex-col items-start gap-1 p-3 text-left`}
                  >
                    <span className="text-[13px] font-semibold text-foreground">
                      {tpl.name}
                    </span>
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
              disabled={isSubmitting || !selectedTemplateId}
            >
              {isSubmitting ? 'Rögzítés...' : 'Bérlet Eladása & Fizetés'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
