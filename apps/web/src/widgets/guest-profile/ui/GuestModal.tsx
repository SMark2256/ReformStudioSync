import {
  DocumentStatus,
  DocumentType,
  GuestDto,
  MembershipStatus,
  PassType,
  ServiceDto,
} from '@reform/shared';
import {
  ArrowLeft,
  CalendarPlus,
  Camera,
  FileSignature,
  Mail,
  MessageSquarePlus,
  PauseCircle,
  PlayCircle,
  QrCode,
  RotateCcw,
  Ruler,
  Snowflake,
  Sun,
  Upload,
  UserPlus,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '@/shared/api';
import { formatBytes, optimizeImageFile } from '@/shared/lib/image';
import { handleAppError } from '@/shared/lib/errors';
import { notify } from '@/shared/lib/notify';

type GuestSheetTab =
  | 'overview'
  | 'memberships'
  | 'passes'
  | 'treatments'
  | 'payments'
  | 'measurements'
  | 'photos'
  | 'documents';

interface GuestModalProps {
  isOpen: boolean;
  guest: GuestDto | null; // null = új vendég felvétele
  services?: ServiceDto[];
  backLabel?: string;
  onClose: () => void;
  onSaveGuest: (data: {
    id?: string;
    firstName: string;
    lastName: string;
    barcode?: string;
    email?: string;
    phone?: string;
    birthDate?: string | null;
    nameDay?: string | null;
    notes?: string;
  }) => void;
  onExtendPass?: (passId: string, additionalDays: number, note: string) => void;
  onToggleFreezePass?: (passId: string, note?: string) => void;
  onOpenDigitalCard?: (guest: GuestDto) => void;
  onRefreshAll?: () => void;
}

export const GuestModal: React.FC<GuestModalProps> = ({
  isOpen,
  guest,
  services = [],
  backLabel = 'Vissza a vendégkartotékra',
  onClose,
  onSaveGuest,
  onExtendPass,
  onToggleFreezePass,
  onOpenDigitalCard,
  onRefreshAll,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<GuestSheetTab>('overview');

  // Basic Info State
  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [nameDay, setNameDay] = useState('');
  const [notes, setNotes] = useState('');

  // Internal Note state
  const [newInternalNote, setNewInternalNote] = useState('');

  // Membership state
  const [newMembTitle, setNewMembTitle] = useState('Női Köredzés Havi Tagság');
  const [newMembFee, setNewMembFee] = useState<number>(22000);
  const [newMembDueDay, setNewMembDueDay] = useState<number>(10);

  // Pass extension reason
  const [extendReason, setExtendReason] = useState(
    'Igazolt hiányzás / betegség',
  );

  // Reversal reason state
  const [reversalReason, setReversalReason] = useState(
    'Téves recepciós rögzítés korrekciója',
  );

  // Measurement state (6.1)
  const [weightKg, setWeightKg] = useState<string>('65.0');
  const [bodyFatPct, setBodyFatPct] = useState<string>('24.5');
  const [muscleMassKg, setMuscleMassKg] = useState<string>('46.0');
  const [visceralFat, setVisceralFat] = useState<string>('4');
  const [waistCm, setWaistCm] = useState<string>('74');
  const [hipCm, setHipCm] = useState<string>('98');
  const [thighCm, setThighCm] = useState<string>('56');
  const [armCm, setArmCm] = useState<string>('28');
  const [chestCm, setChestCm] = useState<string>('91');
  const [measNotes, setMeasNotes] = useState<string>('');

  // Photo state (6.2 + automatic WebP/JPEG compression)
  const [photoServiceId, setPhotoServiceId] = useState<string>('');
  const [photoNotes, setPhotoNotes] = useState<string>('');
  const [isOptimizingPhoto, setIsOptimizingPhoto] = useState<boolean>(false);
  const [lastCompressionInfo, setLastCompressionInfo] = useState<{
    originalBytes: number;
    compressedBytes: number;
    savedPercent: number;
    width: number;
    height: number;
  } | null>(null);

  // Document & Message state (6.3 + 6.4)
  const [docTitle, setDocTitle] = useState<string>(
    'GDPR Adatkezelési és Egészségügyi Nyilatkozat',
  );
  const [docType, setDocType] = useState<DocumentType>(DocumentType.GDPR_CONSENT);
  const [emailSubject, setEmailSubject] = useState<string>(
    'RE-FORM Stúdió — Tagsági értesítő',
  );
  const [emailBody, setEmailBody] = useState<string>(
    'Kedves Vendégünk! Köszönjük, hogy a RE-FORM Stúdiót választod!',
  );

  useEffect(() => {
    if (!isOpen) return;
    const st = (location.state as { guestSubTab?: GuestSheetTab } | null) ?? null;
    setActiveTab(st?.guestSubTab ?? 'overview');
  }, [isOpen, location.key, location.state]);

  useEffect(() => {
    if (!isOpen) return;
    if (guest) {
      setLastName(guest.lastName);
      setFirstName(guest.firstName);
      setBarcode(guest.barcode);
      setPhone(guest.phone ?? '');
      setEmail(guest.email ?? '');
      setBirthDate(guest.birthDate ?? '');
      setNameDay(guest.nameDay ?? '');
      setNotes(guest.notes ?? '');
      setPhotoServiceId(services[0]?.id ?? '');
    } else {
      setLastName('');
      setFirstName('');
      setBarcode('');
      setPhone('');
      setEmail('');
      setBirthDate('');
      setNameDay('');
      setNotes('');
    }
  }, [isOpen, guest?.id]);

  if (!isOpen) return null;

  const handleSubmitBasic = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lastName.trim() || !firstName.trim()) return;
    onSaveGuest({
      id: guest?.id,
      lastName: lastName.trim(),
      firstName: firstName.trim(),
      barcode: barcode.trim() || undefined,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      birthDate: birthDate.trim() || null,
      nameDay: nameDay.trim() || null,
      notes: notes.trim() || undefined,
    });
  };

  const handleAddInternalNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guest || !newInternalNote.trim()) return;
    await api.addInternalNote(guest.id, newInternalNote.trim());
    setNewInternalNote('');
    notify.success('Belső megjegyzés naplózva!');
    onRefreshAll?.();
  };

  const handleCreateMembership = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guest) return;
    await api.createMembership({
      guestId: guest.id,
      monthlyFeeHuf: newMembFee,
      dueDay: newMembDueDay,
    });
    notify.success(
      'Új havi tagság és aktuális havi esedékesség létrehozva!',
      `${newMembTitle} (${newMembFee.toLocaleString('hu-HU')} Ft/hó)`,
    );
    onRefreshAll?.();
  };

  const handleUpdateMembershipStatus = async (
    membershipId: string,
    status: MembershipStatus,
  ) => {
    await api.updateMembershipStatus(membershipId, { status });
    notify.info(`Tagság státusza módosítva: ${status}`);
    onRefreshAll?.();
  };

  const handleReverseUsage = async (usageId: string) => {
    if (!reversalReason.trim()) {
      notify.error('Kérjük, adj meg indoklást a visszavonáshoz!');
      return;
    }
    const res = await api.reversePassUsage(usageId, reversalReason);
    notify.success(
      `Kezelés levonás visszavonva: ${res.guestName}`,
      `Indok: ${reversalReason}. Új egyenleg: ${res.restoredRemainingPasses}`,
    );
    onRefreshAll?.();
  };

  const handleAddMeasurement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guest) return;
    await api.addMeasurement(guest.id, {
      weightKg: weightKg ? Number(weightKg) : null,
      bodyFatPct: bodyFatPct ? Number(bodyFatPct) : null,
      muscleMassKg: muscleMassKg ? Number(muscleMassKg) : null,
      visceralFat: visceralFat ? Number(visceralFat) : null,
      waistCm: waistCm ? Number(waistCm) : null,
      hipCm: hipCm ? Number(hipCm) : null,
      thighCm: thighCm ? Number(thighCm) : null,
      armCm: armCm ? Number(armCm) : null,
      chestCm: chestCm ? Number(chestCm) : null,
      note: measNotes.trim() || undefined,
    });
    setMeasNotes('');
    notify.success('Mérési eredmények rögzítve!');
    onRefreshAll?.();
  };

  const handlePhotoFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file || !guest) return;

    setIsOptimizingPhoto(true);
    try {
      const optimized = await optimizeImageFile(file, {
        maxDimensionPx: 1600,
        quality: 0.82,
        preferredMimeType: 'image/webp',
      });

      setLastCompressionInfo({
        originalBytes: optimized.originalSizeBytes,
        compressedBytes: optimized.compressedSizeBytes,
        savedPercent: optimized.savingsPercent,
        width: optimized.width,
        height: optimized.height,
      });

      const srv = services.find((s) => s.id === photoServiceId);

      await api.addPhoto(guest.id, {
        serviceId: srv?.id ?? null,
        fileUrl: optimized.dataUrl,
        mimeType: optimized.mimeType,
        width: optimized.width,
        height: optimized.height,
        originalSizeBytes: optimized.originalSizeBytes,
        compressedSizeBytes: optimized.compressedSizeBytes,
        note: photoNotes.trim() || file.name,
      });

      setPhotoNotes('');
      notify.success(
        `Fénykép optimalizálva és elmentve (${optimized.savingsPercent}% megtakarítás)!`,
        `${formatBytes(optimized.originalSizeBytes)} → ${formatBytes(optimized.compressedSizeBytes)} (${optimized.width}×${optimized.height} WebP)`,
      );
      onRefreshAll?.();
    } catch (err) {
      handleAppError(err, { title: 'Képfeltöltés sikertelen' });
    } finally {
      setIsOptimizingPhoto(false);
      e.target.value = '';
    }
  };

  const handleCreatePendingDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guest || !docTitle.trim()) return;
    await api.createDocument(guest.id, {
      title: docTitle.trim(),
      documentType: docType,
      contentText: `Nyilatkozat: ${docTitle.trim()} - ${guest.lastName} ${guest.firstName}`,
      fieldsJson: {
        guestName: `${guest.lastName} ${guest.firstName}`,
        barcode: guest.barcode,
        consentGdpr: 'Igen',
        healthCheckOk: 'Igen',
      },
    });
    notify.success(
      'Dokumentum kiküldve a Tabletre aláírásra!',
      'Nyisd meg a /tablet nézetet az érintőképernyős aláíráshoz.',
    );
    onRefreshAll?.();
  };

  const handleSendEmailLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guest || !emailSubject.trim()) return;
    await api.sendGuestEmailLog(guest.id, {
      subject: emailSubject.trim(),
      messageType: emailBody.trim() || 'CUSTOM_NOTIFICATION',
    });
    notify.success('E-mail értesítés elküldve és naplózva!');
    onRefreshAll?.();
  };

  const allUsageLogs = (guest?.passes ?? []).flatMap((p) =>
    (p.usageLogs ?? []).map((u) => ({
      ...u,
      passName: p.passTemplateName ?? 'Bérlet',
    })),
  );

  const tabs: { id: GuestSheetTab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Áttekintés' },
    {
      id: 'memberships',
      label: 'Tagságok',
      count: guest?.memberships?.length ?? 0,
    },
    { id: 'passes', label: 'Bérletek', count: guest?.passes?.length ?? 0 },
    {
      id: 'treatments',
      label: 'Kezelések',
      count: allUsageLogs.length,
    },
    {
      id: 'payments',
      label: 'Befizetések',
      count: guest?.payments?.length ?? 0,
    },
    {
      id: 'measurements',
      label: 'Mérések',
      count: guest?.measurements?.length ?? 0,
    },
    {
      id: 'photos',
      label: 'Fényképek',
      count: guest?.photos?.length ?? 0,
    },
    {
      id: 'documents',
      label: 'Dokumentumok',
      count: guest?.documents?.length ?? 0,
    },
  ];

  const handleSelectTab = (nextTab: GuestSheetTab) => {
    if (nextTab === activeTab) return;
    setActiveTab(nextTab);
    const currentState =
      (location.state as Record<string, unknown> | null) ?? {};
    navigate(location.pathname, {
      state: {
        ...currentState,
        guestSheetOpen: true,
        guestSubTab: nextTab,
      },
    });
  };

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition"
          >
            <ArrowLeft className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            {backLabel}
          </button>

          <div className="flex items-center gap-2.5 pl-1">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30">
              <UserPlus className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                {guest
                  ? `Vendégadatlap: ${guest.lastName} ${guest.firstName} (#${guest.barcode})`
                  : 'Új Vendég Regisztrálása'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                RE-FORM Stúdió — Vendégkartoték
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {guest && onOpenDigitalCard && (
            <button
              type="button"
              onClick={() => onOpenDigitalCard(guest)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-500 shadow-sm"
            >
              <QrCode className="h-3.5 w-3.5" />
              Digitális Kártya
            </button>
          )}
        </div>
      </div>

      {/* Simple, Clean Underline Tab Bar (only when viewing existing guest) */}
      {guest && (
        <div className="flex overflow-x-auto border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 gap-1">
          {tabs.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => handleSelectTab(t.id)}
                className={`shrink-0 inline-flex items-center gap-1.5 border-b-2 px-3.5 py-3 text-xs font-bold transition-colors ${
                  active
                    ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <span>{t.label}</span>
                {typeof t.count === 'number' && t.count > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      active
                        ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="p-6 space-y-6">
          {/* TAB 1: ÁTTEKINTÉS & BELSŐ MEGJEGYZÉSEK */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <form onSubmit={handleSubmitBasic} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm"
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
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                      Vonalkód / Kártyaszám
                    </label>
                    <input
                      type="text"
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      placeholder="Üres = Automatikus"
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2 font-mono text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                      Telefonszám
                    </label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+36 30 555 1234"
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm"
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
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                      Születési dátum (YYYY-MM-DD)
                    </label>
                    <input
                      type="date"
                      value={birthDate}
                      onChange={(e) => setBirthDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                      Névnap (MM-DD, pl. 07-26)
                    </label>
                    <input
                      type="text"
                      value={nameDay}
                      onChange={(e) => setNameDay(e.target.value)}
                      placeholder="07-26"
                      className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                    Gyors összefoglaló / Egészségügyi megjegyzés
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Pl. Hypoxi + Köredzés kombinált vendég..."
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="submit"
                    className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-500"
                  >
                    {guest ? 'Alapadatok Mentése' : 'Vendég Létrehozása'}
                  </button>
                </div>
              </form>

              {/* Belső megjegyzések napló (6.4) */}
              {guest && (
                <div className="border-t border-slate-200 dark:border-slate-800 pt-5 space-y-3">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <MessageSquarePlus className="h-4 w-4 text-emerald-600" />
                    Belső Recepciós Feljegyzések (Csak dolgozóknak látható)
                  </h4>
                  <form onSubmit={handleAddInternalNote} className="flex gap-2">
                    <input
                      type="text"
                      value={newInternalNote}
                      onChange={(e) => setNewInternalNote(e.target.value)}
                      placeholder="Új belső feljegyzés rögzítése a vendéghez..."
                      className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2 text-sm"
                    />
                    <button
                      type="submit"
                      className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white"
                    >
                      + Feljegyzés
                    </button>
                  </form>
                  <div className="space-y-2">
                    {(guest.internalNotes ?? []).map((n) => (
                      <div
                        key={n.id}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs flex justify-between"
                      >
                        <div>
                          <span className="font-semibold text-slate-900">
                            {n.content}
                          </span>
                          <span className="block text-[11px] text-slate-400">
                            Írta: {n.authorName}
                          </span>
                        </div>
                        <span className="font-mono text-slate-400">
                          {new Date(n.createdAt).toLocaleString('hu-HU')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: HAVI TAGSÁGOK & ESEDÉKESSÉGEK */}
          {guest && activeTab === 'memberships' && (
            <div className="space-y-5">
              <form
                onSubmit={handleCreateMembership}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4 grid grid-cols-1 gap-3 sm:grid-cols-4"
              >
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Havi Tagság Megnevezése
                  </label>
                  <input
                    type="text"
                    value={newMembTitle}
                    onChange={(e) => setNewMembTitle(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Egyedi havidíj (Ft/hó)
                  </label>
                  <input
                    type="number"
                    value={newMembFee}
                    onChange={(e) => setNewMembFee(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Fordulónap (1–28)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={1}
                      max={28}
                      value={newMembDueDay}
                      onChange={(e) => setNewMembDueDay(Number(e.target.value))}
                      className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                    />
                    <button
                      type="submit"
                      className="flex-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"
                    >
                      + Tagság
                    </button>
                  </div>
                </div>
              </form>

              <div className="space-y-3">
                {(guest.memberships ?? []).map((m) => (
                  <div
                    key={m.id}
                    className="rounded-xl border border-slate-200 p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-base text-slate-900">
                          Havi Köredzés Tagság
                        </span>
                        <span className="ml-2 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                          {m.status}
                        </span>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Egyedi havidíj:{' '}
                          <strong>
                            {m.monthlyFeeHuf.toLocaleString('hu-HU')} Ft / hó
                          </strong>{' '}
                          • Esedékesség: minden hó {m.dueDay}. napja
                        </p>
                      </div>

                      <div className="flex gap-1.5">
                        {m.status !== MembershipStatus.ACTIVE && (
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateMembershipStatus(
                                m.id,
                                MembershipStatus.ACTIVE,
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white"
                          >
                            <PlayCircle className="h-3.5 w-3.5" />
                            Aktiválás
                          </button>
                        )}
                        {m.status === MembershipStatus.ACTIVE && (
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateMembershipStatus(
                                m.id,
                                MembershipStatus.PAUSED,
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-bold text-white"
                          >
                            <PauseCircle className="h-3.5 w-3.5" />
                            Szüneteltetés
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Havi esedékességek (MembershipDue) */}
                    <div className="border-t border-slate-100 pt-2">
                      <span className="text-[11px] font-bold uppercase text-slate-400 block mb-1.5">
                        Havi Esedékességek (Dues) & Hátralék
                      </span>
                      <div className="space-y-1.5">
                        {(m.dues ?? []).map((d) => (
                          <div
                            key={d.id}
                            className="flex flex-wrap items-center justify-between text-xs rounded-lg bg-slate-50 px-3 py-2"
                          >
                            <div>
                              <strong>{d.period}</strong> (Esedékes:{' '}
                              {new Date(d.dueDate).toLocaleDateString('hu-HU')})
                            </div>
                            <div className="flex items-center gap-3">
                              <span>
                                Előírt: {d.amountHuf.toLocaleString('hu-HU')} Ft •
                                Fizetett: {d.paidAmountHuf.toLocaleString('hu-HU')} Ft
                              </span>
                              <span
                                className={`font-bold ${
                                  d.remainingHuf > 0
                                    ? 'text-rose-600'
                                    : 'text-emerald-600'
                                }`}
                              >
                                Hátralék: {d.remainingHuf.toLocaleString('hu-HU')} Ft (
                                {d.status})
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: BÉRLETEK */}
          {guest && activeTab === 'passes' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900">
                  Vendég Bérletei ({guest.passes?.length ?? 0} db) — Több aktív bérlet támogatva
                </h4>
                <input
                  type="text"
                  value={extendReason}
                  onChange={(e) => setExtendReason(e.target.value)}
                  placeholder="Módosítás indoka..."
                  className="w-64 rounded-lg border border-slate-200 px-2.5 py-1 text-xs"
                />
              </div>

              {(guest.passes ?? []).map((pass) => {
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
                              LEJÁRT / KIMERÜLT
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">
                          Hátralévő alkalmak:{' '}
                          <strong>
                            {pass.type === PassType.TIME_BASED
                              ? 'Korlátlan'
                              : `${pass.remainingPasses} / ${pass.totalPasses} db`}
                          </strong>{' '}
                          (Felhasznált: {pass.usedPassesCount ?? 0} db) • Lejárat:{' '}
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
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-emerald-50"
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
                              ? 'bg-amber-500 text-white'
                              : 'bg-sky-600 text-white'
                          }`}
                        >
                          {pass.isFrozen ? (
                            <>
                              <Sun className="h-3.5 w-3.5" />
                              Feloldás
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
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 4: KEZELÉSI ELŐZMÉNYEK & VISSZAVONÁS */}
          {guest && activeTab === 'treatments' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Kezelési és Bérletlevonási Előzmények
                </h4>
                <input
                  type="text"
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="Visszavonás (sztornó) indoka..."
                  className="w-72 rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
                />
              </div>

              {allUsageLogs.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Még nincs rögzített kezeléslevonás ennél a vendégnél.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {allUsageLogs.map((u) => (
                    <div
                      key={u.id}
                      className={`flex flex-wrap items-center justify-between gap-2 p-3 text-xs ${
                        u.reversedAt ? 'bg-rose-50/40 line-through text-slate-400' : ''
                      }`}
                    >
                      <div>
                        <span className="font-bold text-slate-900">
                          {u.serviceName ?? u.passName}
                        </span>{' '}
                        • <span>{u.note}</span>
                        <div className="text-[11px] text-slate-400">
                          Rögzítette: {u.employeeName ?? 'Recepció'} •{' '}
                          {new Date(u.usedAt).toLocaleString('hu-HU')}
                        </div>
                      </div>
                      <div>
                        {u.reversedAt ? (
                          <span className="text-rose-600 font-bold">
                            VISSZAVONVA ({u.reversalReason})
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleReverseUsage(u.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 font-bold text-amber-800 hover:bg-amber-100"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Levonás Visszavonása (+1 alkalom)
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: BEFIZETÉSEK */}
          {guest && activeTab === 'payments' && (
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-slate-900">
                Vendég Pénzügyi Tranzakciói ({guest.payments?.length ?? 0} db)
              </h4>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {(guest.payments ?? []).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-3 text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-900">
                        {p.amount.toLocaleString('hu-HU')} Ft
                      </span>{' '}
                      — <span>{p.note ?? p.passName}</span>
                      <div className="text-[11px] text-slate-400">
                        {new Date(p.createdAt).toLocaleString('hu-HU')} •{' '}
                        {p.paymentMethod}
                      </div>
                    </div>
                    <span
                      className={`font-bold ${
                        p.isCancelled ? 'text-rose-600' : 'text-emerald-600'
                      }`}
                    >
                      {p.isCancelled ? 'SZTORNÓZVA' : ' FIZETVE'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 6: MÉRÉSEK (6.1) */}
          {guest && activeTab === 'measurements' && (
            <div className="space-y-5">
              <form
                onSubmit={handleAddMeasurement}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3"
              >
                <h4 className="text-xs font-bold uppercase text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Ruler className="h-4 w-4 text-emerald-600" />
                  Új Testösszetétel & Körméret Mérés Rögzítése
                </h4>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 text-xs">
                  <div>
                    <label className="block font-semibold mb-1">Testsúly (kg)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={weightKg}
                      onChange={(e) => setWeightKg(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">Testzsír (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={bodyFatPct}
                      onChange={(e) => setBodyFatPct(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">Izomtömeg (kg)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={muscleMassKg}
                      onChange={(e) => setMuscleMassKg(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">Zsigeri zsír</label>
                    <input
                      type="number"
                      step="0.5"
                      value={visceralFat}
                      onChange={(e) => setVisceralFat(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">Derék (cm)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={waistCm}
                      onChange={(e) => setWaistCm(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">Csípő (cm)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={hipCm}
                      onChange={(e) => setHipCm(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">Comb (cm)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={thighCm}
                      onChange={(e) => setThighCm(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">Kar (cm)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={armCm}
                      onChange={(e) => setArmCm(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">Mellkas (cm)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={chestCm}
                      onChange={(e) => setChestCm(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="w-full rounded-lg bg-emerald-600 py-1.5 font-bold text-white"
                    >
                      + Mérés Mentése
                    </button>
                  </div>
                </div>
              </form>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 uppercase text-slate-500">
                      <th className="py-2 px-2">Dátum</th>
                      <th className="py-2 px-2">Súly (kg)</th>
                      <th className="py-2 px-2">Zsír (%)</th>
                      <th className="py-2 px-2">Izom (kg)</th>
                      <th className="py-2 px-2">Derék / Csípő / Comb (cm)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(guest.measurements ?? []).map((m) => (
                      <tr key={m.id}>
                        <td className="py-2 px-2 font-mono">
                          {new Date(m.measuredAt).toLocaleDateString('hu-HU')}
                        </td>
                        <td className="py-2 px-2 font-bold">{m.weightKg ?? '—'} kg</td>
                        <td className="py-2 px-2">{m.bodyFatPct ?? '—'} %</td>
                        <td className="py-2 px-2">{m.muscleMassKg ?? '—'} kg</td>
                        <td className="py-2 px-2">
                          {m.waistCm ?? '—'} / {m.hipCm ?? '—'} / {m.thighCm ?? '—'} cm
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 7: FÉNYKÉPEK AUTOMATIKUS TÖMÖRÍTÉSSEL (6.2) */}
          {guest && activeTab === 'photos' && (
            <div className="space-y-5">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Camera className="h-5 w-5 text-emerald-600" />
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        Kezelési Állapotfotó Feltöltése Automatikus WebP Optimalizálással
                      </h4>
                      <p className="text-xs text-slate-500">
                        Automatikus átméretezés (max. 1600px), EXIF eltávolítás és WebP 0.82 tömörítés (~80–90% tárhely-megtakarítás).
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <select
                    value={photoServiceId}
                    onChange={(e) => setPhotoServiceId(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold"
                  >
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        Kezelés: {s.name}
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    value={photoNotes}
                    onChange={(e) => setPhotoNotes(e.target.value)}
                    placeholder="Megjegyzés (pl. 1. alkalom előtt, szemből)..."
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                  />

                  <label className="cursor-pointer inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500">
                    <Upload className="h-4 w-4" />
                    {isOptimizingPhoto
                      ? 'Optimalizálás...'
                      : 'Kép Kiválasztása & Tömörítése'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoFileChange}
                      className="hidden"
                    />
                  </label>
                </div>

                {lastCompressionInfo && (
                  <div className="rounded-lg bg-white p-2.5 text-xs text-emerald-800 border border-emerald-200 flex items-center justify-between">
                    <span>
                      ✅ Legutóbbi optimalizálás:{' '}
                      <strong>
                        {formatBytes(lastCompressionInfo.originalBytes)}
                      </strong>{' '}
                      →{' '}
                      <strong>
                        {formatBytes(lastCompressionInfo.compressedBytes)}
                      </strong>{' '}
                      ({lastCompressionInfo.width}×{lastCompressionInfo.height} px)
                    </span>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 font-extrabold text-emerald-900">
                      -{lastCompressionInfo.savedPercent}% fájlméret
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                {(guest.photos ?? []).map((ph) => {
                  const savedPct =
                    ph.originalSizeBytes > 0
                      ? Math.round(
                          (1 - ph.compressedSizeBytes / ph.originalSizeBytes) *
                            100,
                        )
                      : 0;
                  return (
                    <div
                      key={ph.id}
                      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                    >
                      <img
                        src={ph.fileUrl}
                        alt={ph.note ?? 'Kezelési fotó'}
                        className="h-44 w-full object-cover bg-slate-900"
                      />
                      <div className="p-3 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">
                            {ph.serviceName ?? 'Állapotfotó'}
                          </span>
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                            -{savedPct}% ({formatBytes(ph.compressedSizeBytes)})
                          </span>
                        </div>
                        <p className="text-slate-500">{ph.note}</p>
                        <p className="text-[10px] text-slate-400">
                          {new Date(ph.takenAt).toLocaleString('hu-HU')} •{' '}
                          {ph.width}×{ph.height}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 8: DOKUMENTUMOK, TABLET ALÁÍRÁS & E-MAIL NAPLÓ (6.3 & 6.4) */}
          {guest && activeTab === 'documents' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileSignature className="h-5 w-5 text-emerald-600" />
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      Dokumentum Kiküldése Tabletre Aláírásra
                    </h4>
                  </div>
                  <Link
                    to="/tablet"
                    className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white"
                  >
                    Tablet Aláíró Nézet Megnyitása (/tablet) →
                  </Link>
                </div>

                <form
                  onSubmit={handleCreatePendingDocument}
                  className="grid grid-cols-1 gap-3 sm:grid-cols-3"
                >
                  <input
                    type="text"
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
                  />
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value as DocumentType)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs"
                  >
                    <option value={DocumentType.GDPR_CONSENT}>
                      GDPR Adatkezelési Nyilatkozat
                    </option>
                    <option value={DocumentType.HEALTH_QUESTIONNAIRE}>
                      Egészségügyi & Állapotfelmérő Nyilatkozat
                    </option>
                    <option value={DocumentType.TREATMENT_CONSENT}>
                      Kezelési Beleegyező Nyilatkozat (Hypoxi)
                    </option>
                    <option value={DocumentType.HOUSE_RULES}>
                      Házirend Elfogadás
                    </option>
                  </select>
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white"
                  >
                    + Kiküldés Tabletre Aláírásra
                  </button>
                </form>

                <div className="space-y-2 pt-2">
                  {(guest.documents ?? []).map((doc) => (
                    <div
                      key={doc.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs"
                    >
                      <div>
                        <span className="font-bold text-slate-900">
                          {doc.title}
                        </span>
                        <span
                          className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            doc.status === DocumentStatus.SIGNED
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {doc.status === DocumentStatus.SIGNED
                            ? 'ALÁÍRVA (Zárolt)'
                            : 'TABLET ALÁÍRÁSRA VÁR'}
                        </span>
                        <p className="text-[11px] text-slate-400">
                          {doc.signedAt
                            ? `Aláírva: ${new Date(doc.signedAt).toLocaleString('hu-HU')}`
                            : `Létrehozva: ${new Date(doc.createdAt).toLocaleString('hu-HU')}`}
                        </p>
                      </div>
                      {doc.signatureDataUrl && (
                        <img
                          src={doc.signatureDataUrl}
                          alt="Aláírás"
                          className="h-10 rounded border border-slate-200 bg-white px-2"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* E-mail kommunikációs napló */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4 space-y-3">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Mail className="h-4 w-4 text-emerald-600" />
                  Kimenő E-mail Értesítés & Napló
                </h4>
                <form
                  onSubmit={handleSendEmailLog}
                  className="grid grid-cols-1 gap-2 sm:grid-cols-3"
                >
                  <input
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder="Tárgy..."
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
                  />
                  <input
                    type="text"
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    placeholder="Üzenet szövege..."
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-bold text-white"
                  >
                    E-mail Küldése & Naplózása
                  </button>
                </form>

                <div className="space-y-1.5">
                  {(guest.messageLogs ?? []).map((msg) => (
                    <div
                      key={msg.id}
                      className="flex items-center justify-between rounded-lg bg-white p-2.5 text-xs border border-slate-200"
                    >
                      <div>
                        <strong>{msg.subject}</strong> → {msg.recipientEmail}
                        <p className="text-[11px] text-slate-500">{msg.messageType}</p>
                      </div>
                      <span className="font-mono text-[11px] text-emerald-600 font-bold">
                        {msg.status} (
                        {new Date(msg.sentAt).toLocaleDateString('hu-HU')})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
      </div>
    </div>
  );
};
