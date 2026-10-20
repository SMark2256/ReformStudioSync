import { GuestDto, PassType } from '@reform/shared';
import {
  CalendarPlus,
  History,
  QrCode,
  Snowflake,
  Sun,
  UserPlus,
  X,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';

interface GuestModalProps {
  isOpen: boolean;
  guest: GuestDto | null; // null = új vendég felvétele
  onClose: () => void;
  onSaveGuest: (data: {
    id?: string;
    firstName: string;
    lastName: string;
    barcode?: string;
    email?: string;
    phone?: string;
    notes?: string;
  }) => void;
  onExtendPass?: (passId: string, additionalDays: number, note: string) => void;
  onToggleFreezePass?: (passId: string, note?: string) => void;
  onOpenDigitalCard?: (guest: GuestDto) => void;
}

export const GuestModal: React.FC<GuestModalProps> = ({
  isOpen,
  guest,
  onClose,
  onSaveGuest,
  onExtendPass,
  onToggleFreezePass,
  onOpenDigitalCard,
}) => {
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [extendReason, setExtendReason] = useState('Igazolt hiányzás / betegség');

  useEffect(() => {
    if (!isOpen) return;
    if (guest) {
      setLastName(guest.lastName);
      setFirstName(guest.firstName);
      setBarcode(guest.barcode);
      setPhone(guest.phone ?? '');
      setEmail(guest.email ?? '');
      setNotes(guest.notes ?? '');
    } else {
      setLastName('');
      setFirstName('');
      setBarcode('');
      setPhone('');
      setEmail('');
      setNotes('');
    }
  }, [isOpen, guest]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lastName.trim() || !firstName.trim()) return;
    onSaveGuest({
      id: guest?.id,
      lastName: lastName.trim(),
      firstName: firstName.trim(),
      barcode: barcode.trim() || undefined,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="my-8 w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-900 px-6 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <UserPlus className="h-5 w-5 text-emerald-400" />
            <h3 className="text-lg font-semibold">
              {guest
                ? `Vendég Kartoték & Bérlet Kezelés: ${guest.lastName} ${guest.firstName}`
                : 'Új Vendég Regisztrálása'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[82vh] overflow-y-auto p-6 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  Vezetéknév *
                </label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Pl. Kovács"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  Keresztnév *
                </label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Pl. Anna"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  Vonalkód / Kártyaszám
                </label>
                <input
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="Üres = Automatikus"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 font-mono text-sm focus:border-emerald-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  Telefonszám
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+36 30 555 1234"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  E-mail cím
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vendeg@email.hu"
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                Megjegyzés / Egészségügyi vagy csoport infó
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Pl. Kezdő Reformer, térdérzékenység..."
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              {guest && onOpenDigitalCard ? (
                <button
                  type="button"
                  onClick={() => onOpenDigitalCard(guest)}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                >
                  <QrCode className="h-4 w-4" />
                  Digitális Kártya (Code-128 & QR)
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Mégse
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  {guest ? 'Adatok Mentése' : 'Vendég Létrehozása'}
                </button>
              </div>
            </div>
          </form>

          {guest && guest.passes && guest.passes.length > 0 && (
            <div className="border-t border-slate-200 pt-5 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                  Bérletek, Hosszabbítás (+N nap) és Fagyasztás
                </h4>
                <input
                  type="text"
                  value={extendReason}
                  onChange={(e) => setExtendReason(e.target.value)}
                  placeholder="Módosítás indoka..."
                  className="w-56 rounded-lg border border-slate-200 px-2.5 py-1 text-xs"
                />
              </div>

              <div className="space-y-3">
                {guest.passes.map((pass) => {
                  const isExpired =
                    new Date(pass.expirationDate).getTime() < Date.now();
                  return (
                    <div
                      key={pass.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">
                              {pass.passTemplateName ?? 'Bérlet'}
                            </span>
                            {pass.isFrozen ? (
                              <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-bold text-sky-800">
                                FAGYASZTVA
                              </span>
                            ) : pass.isActive && !isExpired ? (
                              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                                AKTÍV
                              </span>
                            ) : (
                              <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-800">
                                LEJÁRT / INAKTÍV
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 mt-0.5">
                            Egyenleg:{' '}
                            <strong>
                              {pass.type === PassType.TIME_BASED
                                ? 'Korlátlan'
                                : `${pass.remainingPasses} / ${pass.totalPasses} alkalom`}
                            </strong>{' '}
                            • Lejárat:{' '}
                            <strong>
                              {new Date(pass.expirationDate).toLocaleDateString(
                                'hu-HU',
                              )}
                            </strong>
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {[7, 14, 30].map((days) => (
                            <button
                              key={days}
                              type="button"
                              onClick={() =>
                                onExtendPass?.(
                                  pass.id,
                                  days,
                                  extendReason || 'Admin hosszabbítás',
                                )
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-800"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />+{days} nap
                            </button>
                          ))}

                          <button
                            type="button"
                            onClick={() =>
                              onToggleFreezePass?.(pass.id, extendReason)
                            }
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ${
                              pass.isFrozen
                                ? 'bg-amber-500 text-white hover:bg-amber-600'
                                : 'bg-sky-600 text-white hover:bg-sky-500'
                            }`}
                          >
                            {pass.isFrozen ? (
                              <>
                                <Sun className="h-3.5 w-3.5" />
                                Feloldás (+napok jóváírása)
                              </>
                            ) : (
                              <>
                                <Snowflake className="h-3.5 w-3.5" />
                                Fagyasztás
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {pass.usageLogs && pass.usageLogs.length > 0 && (
                        <div className="border-t border-slate-200/80 pt-2">
                          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase text-slate-400 mb-1">
                            <History className="h-3 w-3" />
                            Bérlet Audit Napló (Utolsó műveletek)
                          </p>
                          <div className="space-y-1 max-h-24 overflow-y-auto">
                            {pass.usageLogs.slice(0, 5).map((log) => (
                              <div
                                key={log.id}
                                className="flex items-center justify-between text-xs text-slate-600"
                              >
                                <span>{log.note}</span>
                                <span className="font-mono text-[11px] text-slate-400">
                                  {new Date(log.usedAt).toLocaleString('hu-HU')}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
