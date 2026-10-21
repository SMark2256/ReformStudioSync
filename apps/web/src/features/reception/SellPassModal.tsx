import {
  GuestDto,
  PassTemplateDto,
  PassType,
  PaymentMethod,
} from '@reform/shared';
import { Banknote, Building2, CreditCard, Sparkles, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-6 py-4 text-slate-900 dark:text-white">
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Bérletértékesítés & Kassza Rögzítés
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Vendég: {guest.lastName} {guest.firstName} ({guest.barcode})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              1. Válassz Bérlettípust
            </label>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {activeTemplates.map((tpl) => {
                const isSelected = tpl.id === selectedTemplateId;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setSelectedTemplateId(tpl.id)}
                    className={`flex flex-col items-start rounded-xl border p-3.5 text-left transition-all ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-600/20'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="font-semibold text-slate-900 text-sm">
                        {tpl.name}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                      <span>
                        {tpl.type === PassType.TIME_BASED
                          ? 'Korlátlan belépés'
                          : `${tpl.totalPasses} alkalom`}
                      </span>
                      <span>•</span>
                      <span>{tpl.durationDays} napig érvényes</span>
                    </div>
                    <span className="mt-2 text-base font-bold text-emerald-700">
                      {tpl.price.toLocaleString('hu-HU')} Ft
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              2. Fizetési Mód Kiválasztása
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                {
                  id: PaymentMethod.POS_CARD,
                  label: 'Bankkártya (POS)',
                  icon: CreditCard,
                },
                {
                  id: PaymentMethod.CASH,
                  label: 'Készpénz',
                  icon: Banknote,
                },
                {
                  id: PaymentMethod.BANK_TRANSFER,
                  label: 'Átutalás',
                  icon: Building2,
                },
              ].map((m) => {
                const Icon = m.icon;
                const active = paymentMethod === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id)}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border py-3 px-2 text-xs font-semibold transition-all ${
                      active
                        ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Megjegyzés (Opcionális)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Pl. Bérletmegújítás / Ajándékutalvány..."
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl bg-slate-50 p-4 border border-slate-200">
            <div>
              <span className="text-xs text-slate-500">Fizetendő végösszeg:</span>
              <p className="text-2xl font-extrabold text-slate-900">
                {(selectedTemplate?.price ?? 0).toLocaleString('hu-HU')} Ft
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Mégse
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !selectedTemplateId}
                className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
              >
                {isSubmitting ? 'Rögzítés...' : 'Bérlet Eladása & Fizetés'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
