import {
  GuestDto,
  MembershipDueStatus,
  PaymentMethod,
} from '@reform/shared';
import { Banknote, Building2, CreditCard, Wallet, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';

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
  const [selectedGuestId, setSelectedGuestId] = useState<string>('');
  const [targetType, setTargetType] = useState<'DUE' | 'PASS' | 'CUSTOM'>(
    'DUE',
  );
  const [selectedDueId, setSelectedDueId] = useState<string>('');
  const [selectedPassId, setSelectedPassId] = useState<string>('');
  const [amountHuf, setAmountHuf] = useState<number>(22000);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    PaymentMethod.CASH,
  );
  const [note, setNote] = useState<string>('');

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGuestId || amountHuf <= 0) return;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="my-8 w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-6 py-4 text-slate-900 dark:text-white">
          <div className="flex items-center gap-2.5">
            <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Befizetés Rögzítése & Tagdíj Elszámolás
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Készpénz, bankkártya vagy átutalás hozzárendelése havi tagdíjhoz vagy bérlethez
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              1. Vendég Kiválasztása
            </label>
            <select
              value={selectedGuestId}
              onChange={(e) => setSelectedGuestId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm font-semibold text-slate-900 dark:text-white"
            >
              {guests.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.lastName} {g.firstName} (#{g.barcode})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              2. Befizetés Célja (Payment Allocation)
            </label>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { id: 'DUE', label: `Havi Tagdíj (${openDues.length})` },
                { id: 'PASS', label: 'Meglévő Bérlethez' },
                { id: 'CUSTOM', label: 'Egyéb Befizetés' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    setTargetType(t.id as 'DUE' | 'PASS' | 'CUSTOM')
                  }
                  className={`rounded-xl border py-2 px-2 text-xs font-bold transition ${
                    targetType === t.id
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {targetType === 'DUE' && (
              <div>
                {openDues.length === 0 ? (
                  <p className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3 text-xs text-slate-500">
                    Ennek a vendégnek jelenleg nincs nyitott havi tagdíj-esedékessége.
                  </p>
                ) : (
                  <select
                    value={selectedDueId}
                    onChange={(e) => {
                      setSelectedDueId(e.target.value);
                      const d = openDues.find((x) => x.id === e.target.value);
                      if (d) setAmountHuf(d.remainingHuf);
                    }}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-sm text-slate-900 dark:text-white"
                  >
                    {openDues.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.period} havi tagdíj — Hátralék:{' '}
                        {d.remainingHuf.toLocaleString('hu-HU')} Ft (Összesen:{' '}
                        {d.amountHuf.toLocaleString('hu-HU')} Ft)
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {targetType === 'PASS' && (
              <select
                value={selectedPassId}
                onChange={(e) => setSelectedPassId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-sm text-slate-900 dark:text-white"
              >
                {(selectedGuest?.passes ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.passTemplateName} ({new Date(p.createdAt).toLocaleDateString('hu-HU')})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Fizetett összeg (Ft, egész forintban)
              </label>
              <input
                type="number"
                min={1}
                step={100}
                required
                value={amountHuf}
                onChange={(e) => setAmountHuf(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-base font-extrabold text-slate-900 dark:text-white"
              />
              <span className="text-[11px] text-slate-400">
                Részbefizetés és túlfizetés is rögzíthető.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Megjegyzés
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Pl. Havi tagdíj / Részbefizetés..."
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-sm text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              3. Fizetési Mód
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { id: PaymentMethod.CASH, label: 'Készpénz', icon: Banknote },
                {
                  id: PaymentMethod.POS_CARD,
                  label: 'Bankkártya',
                  icon: CreditCard,
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
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl border py-2.5 px-2 text-xs font-semibold transition-all ${
                      active
                        ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              Mégse
            </button>
            <button
              type="submit"
              disabled={isSubmitting || amountHuf <= 0}
              className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {isSubmitting
                ? 'Rögzítés...'
                : `Befizetés Rögzítése (${amountHuf.toLocaleString('hu-HU')} Ft)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
