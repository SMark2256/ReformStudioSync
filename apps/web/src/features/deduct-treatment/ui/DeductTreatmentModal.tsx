import { GuestDto, PassType, ServiceDto } from '@reform/shared';
import {
  AlertTriangle,
  CheckCircle2,
  Search,
  Sparkles,
  Ticket,
  X,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';

interface DeductTreatmentModalProps {
  isOpen: boolean;
  initialGuest: GuestDto | null;
  guests: GuestDto[];
  services: ServiceDto[];
  isSubmitting?: boolean;
  onClose: () => void;
  onConfirmDeduct: (data: {
    guestId: string;
    passId: string;
    serviceId: string;
    operationKey: string;
    note?: string;
  }) => void;
  onOpenSellPass?: (guest: GuestDto) => void;
}

export const DeductTreatmentModal: React.FC<DeductTreatmentModalProps> = ({
  isOpen,
  initialGuest,
  guests,
  services,
  isSubmitting = false,
  onClose,
  onConfirmDeduct,
  onOpenSellPass,
}) => {
  const [guestSearch, setGuestSearch] = useState('');
  const [selectedGuestId, setSelectedGuestId] = useState<string>('');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [selectedPassId, setSelectedPassId] = useState<string>('');
  const [note, setNote] = useState<string>('');

  const treatmentServices = services.filter((s) => s.isActive);

  useEffect(() => {
    if (!isOpen) return;
    const g = initialGuest ?? guests[0] ?? null;
    setSelectedGuestId(g?.id ?? '');
    setGuestSearch('');
    setNote('');

    const defaultService =
      treatmentServices.find((s) => s.name.toLowerCase().includes('hypoxi')) ??
      treatmentServices[0];
    setSelectedServiceId(defaultService?.id ?? '');
  }, [isOpen, initialGuest]);

  const selectedGuest = guests.find((g) => g.id === selectedGuestId) ?? null;

  const activePasses = (selectedGuest?.passes ?? []).filter((p) => {
    if (!p.isActive || p.isFrozen) return false;
    if (new Date(p.expirationDate) < new Date()) return false;
    if (p.type === PassType.TIME_BASED) return true;
    return (p.remainingPasses ?? 0) > 0;
  });

  useEffect(() => {
    if (!selectedGuest) {
      setSelectedPassId('');
      return;
    }
    const matchingByService = activePasses.find(
      (p) => p.serviceId && p.serviceId === selectedServiceId,
    );
    setSelectedPassId(matchingByService?.id ?? activePasses[0]?.id ?? '');
  }, [selectedGuestId, selectedServiceId]);

  if (!isOpen) return null;

  const selectedPass = activePasses.find((p) => p.id === selectedPassId);
  const selectedService = treatmentServices.find(
    (s) => s.id === selectedServiceId,
  );

  const filteredGuests = guests.filter((g) => {
    const q = guestSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      `${g.lastName} ${g.firstName}`.toLowerCase().includes(q) ||
      g.barcode.toLowerCase().includes(q)
    );
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGuest || !selectedPass || !selectedServiceId) return;
    onConfirmDeduct({
      guestId: selectedGuest.id,
      passId: selectedPass.id,
      serviceId: selectedServiceId,
      operationKey: `deduct-${selectedPass.id}-${Date.now()}`,
      note: note.trim() || undefined,
    });
  };

  const remainingAfterDeduction =
    selectedPass?.type === PassType.OCCASION_BASED
      ? Math.max(0, (selectedPass.remainingPasses ?? 1) - 1)
      : 'Korlátlan';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="my-8 w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-6 py-4 text-slate-900 dark:text-white">
          <div className="flex items-center gap-2.5">
            <Ticket className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Alkalmas Kezelés Kiválasztása & Bérlet Levonás
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Kézi kezelésválasztás, bérletellenőrzés és tranzakciós alkalomlevonás
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

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* 1. Vendég kiválasztása */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              1. Vendég Kiválasztása
            </label>
            {!initialGuest && (
              <div className="relative mb-2">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={guestSearch}
                  onChange={(e) => setGuestSearch(e.target.value)}
                  placeholder="Keresés név vagy vonalkód alapján..."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-white"
                />
              </div>
            )}
            <select
              value={selectedGuestId}
              onChange={(e) => setSelectedGuestId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm font-semibold text-slate-900 dark:text-white"
            >
              {filteredGuests.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.lastName} {g.firstName} (#{g.barcode}) —{' '}
                  {(g.passes ?? []).filter((p) => p.isActive && !p.isFrozen)
                    .length}{' '}
                  aktív bérlet
                </option>
              ))}
            </select>
          </div>

          {/* 2. Kezelés (Service) kézi kiválasztása */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              2. Kezelés Kézi Kiválasztása (Vendégmonitoron megjelenik)
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {treatmentServices.map((srv) => {
                const isSelected = srv.id === selectedServiceId;
                return (
                  <button
                    key={srv.id}
                    type="button"
                    onClick={() => setSelectedServiceId(srv.id)}
                    className={`flex items-center justify-between rounded-xl border p-3 text-left transition-all ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/50 ring-2 ring-emerald-600/20'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/80'
                    }`}
                  >
                    <div>
                      <span className="font-bold text-sm text-slate-900 dark:text-white block">
                        {srv.name}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {srv.durationMinutes} perc •{' '}
                        {srv.priceHuf.toLocaleString('hu-HU')} Ft
                      </span>
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Aktív bérlet kiválasztása */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              3. Vendég Aktív Bérletének Kiválasztása ({activePasses.length} db elérhető)
            </label>

            {activePasses.length === 0 ? (
              <div className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 text-rose-800 dark:text-rose-200">
                  <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0" />
                  <div className="text-xs">
                    <strong className="block text-sm">
                      Nincs felhasználható aktív bérlet!
                    </strong>
                    A vendégnek nincs érvényes bérlete, vagy minden alkalma elfogyott / fagyasztva van.
                  </div>
                </div>
                {selectedGuest && onOpenSellPass && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenSellPass(selectedGuest);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Új Bérlet Eladása
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {activePasses.map((p) => {
                  const isSelected = p.id === selectedPassId;
                  const rem = p.remainingPasses ?? 0;
                  const isLow =
                    p.type === PassType.OCCASION_BASED && rem <= 2;

                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPassId(p.id)}
                      className={`w-full flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3.5 text-left transition-all ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/50 ring-2 ring-emerald-600/20'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 dark:text-white">
                            {p.passTemplateName}
                          </span>
                          {isLow && (
                            <span className="rounded-full bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-200">
                              Figyelem: már csak {rem} alkalom!
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Érvényes:{' '}
                          {new Date(p.expirationDate).toLocaleDateString(
                            'hu-HU',
                          )}{' '}
                          • Eddig felhasznált: {p.usedPassesCount ?? 0} alk.
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-slate-500 dark:text-slate-400 block">
                          Jelenlegi egyenleg
                        </span>
                        <strong className="text-base font-extrabold text-emerald-700 dark:text-emerald-400">
                          {p.type === PassType.TIME_BASED
                            ? 'Korlátlan'
                            : `${rem} / ${p.totalPasses} db`}
                        </strong>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Megjegyzés a kezeléshez (Opcionális)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Pl. Hypoxi L250 gép, 30 perc..."
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-sm text-slate-900 dark:text-white"
            />
          </div>

          {/* Vendégmonitor előnézeti sáv */}
          {selectedGuest && selectedPass && selectedService && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 p-3.5 text-xs text-emerald-950 dark:text-emerald-200">
              <span className="font-bold uppercase text-[10px] text-emerald-700 dark:text-emerald-400 block mb-1">
                Vendégmonitoron megjelenő üzenet levonás után:
              </span>
              <p className="font-semibold">
                „Üdvözlünk, {selectedGuest.lastName} {selectedGuest.firstName}!{' '}
                {selectedService.name}. Hátralévő alkalmak:{' '}
                {remainingAfterDeduction}. Kellemes kezelést kívánunk!”
              </p>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100"
            >
              Mégse
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedPass || !selectedServiceId}
              className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
            >
              {isSubmitting ? 'Levonás...' : '1 Alkalom Levonása & Üdvözlés'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
