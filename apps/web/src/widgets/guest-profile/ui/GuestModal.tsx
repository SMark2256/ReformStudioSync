import {
  DocumentStatus,
  DocumentType,
  GuestDto,
  MembershipDueStatus,
  MembershipStatus,
  PaymentMethod,
  ServiceDto,
} from '@reform/shared';
import {
  ArrowLeft,
  CalendarPlus,
  PauseCircle,
  PlayCircle,
  QrCode,
  RotateCcw,
  Snowflake,
  Sun,
  Upload,
} from 'lucide-react';
import React, { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  formatRemainingPasses,
  MEMBERSHIP_STATUS_LABEL,
  PASS_STATUS_BADGE,
} from '@/entities/guest';
import { api } from '@/shared/api';
import { formatBytes, optimizeImageFile } from '@/shared/lib/image';
import { handleAppError } from '@/shared/lib/errors';
import { notify } from '@/shared/lib/notify';
import { cn } from '@/shared/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Avatar,
  Badge,
  Button,
  Card,
  CardActions,
  CardHeader,
  CardTitle,
  Input,
  Label,
  ResponsiveTable,
  type ResponsiveTableColumn,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ToggleGroup,
  ToggleGroupItem,
} from '@/shared/ui';

const DUE_STATUS_LABEL: Record<MembershipDueStatus, string> = {
  [MembershipDueStatus.PENDING]: 'függőben',
  [MembershipDueStatus.PARTIAL]: 'részben fizetve',
  [MembershipDueStatus.PAID]: 'fizetve',
  [MembershipDueStatus.WAIVED]: 'elengedve',
};

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]: 'Készpénz',
  [PaymentMethod.POS_CARD]: 'Bankkártya',
  [PaymentMethod.BANK_TRANSFER]: 'Átutalás',
};

const DOCUMENT_TYPE_OPTIONS: { value: DocumentType; label: string }[] = [
  { value: DocumentType.GDPR_CONSENT, label: 'GDPR adatkezelési nyilatkozat' },
  {
    value: DocumentType.HEALTH_QUESTIONNAIRE,
    label: 'Egészségügyi és állapotfelmérő nyilatkozat',
  },
  {
    value: DocumentType.TREATMENT_CONSENT,
    label: 'Kezelési beleegyező nyilatkozat (Hypoxi)',
  },
  { value: DocumentType.HOUSE_RULES, label: 'Házirend elfogadása' },
];

const formatDateTime = (iso: string) => new Date(iso).toLocaleString('hu-HU');
const formatDate = (iso: string) => new Date(iso).toLocaleDateString('hu-HU');

type GuestSheetTab =
  | 'overview'
  | 'memberships'
  | 'passes'
  | 'treatments'
  | 'payments'
  | 'measurements'
  | 'photos'
  | 'documents';

type GuestPayment = NonNullable<GuestDto['payments']>[number];
type GuestMeasurement = NonNullable<GuestDto['measurements']>[number];

const PAYMENT_COLUMNS: ResponsiveTableColumn<GuestPayment>[] = [
  {
    key: 'date',
    header: 'Időpont',
    cell: (p) => (
      <span className="font-mono text-xs text-muted-foreground">
        {formatDateTime(p.createdAt)}
      </span>
    ),
  },
  { key: 'item', header: 'Tétel', cell: (p) => p.note ?? p.passName ?? '—' },
  {
    key: 'method',
    header: 'Fizetési mód',
    cell: (p) => PAYMENT_METHOD_LABEL[p.paymentMethod],
  },
  {
    key: 'amount',
    header: 'Összeg',
    align: 'right',
    cell: (p) => `${p.amount.toLocaleString('hu-HU')} Ft`,
  },
  {
    key: 'status',
    header: 'Állapot',
    cell: (p) =>
      p.isCancelled ? (
        <Badge variant="destructive">Sztornózva</Badge>
      ) : (
        <Badge variant="success">Fizetve</Badge>
      ),
  },
];

const MEASUREMENT_COLUMNS: ResponsiveTableColumn<GuestMeasurement>[] = [
  {
    key: 'date',
    header: 'Dátum',
    cell: (m) => (
      <span className="font-mono text-xs text-muted-foreground">
        {formatDate(m.measuredAt)}
      </span>
    ),
  },
  {
    key: 'weight',
    header: 'Súly (kg)',
    align: 'right',
    cell: (m) => m.weightKg ?? '—',
  },
  {
    key: 'fat',
    header: 'Zsír (%)',
    align: 'right',
    cell: (m) => m.bodyFatPct ?? '—',
  },
  {
    key: 'muscle',
    header: 'Izom (kg)',
    align: 'right',
    cell: (m) => m.muscleMassKg ?? '—',
  },
  {
    key: 'girth',
    header: 'Derék / csípő / comb (cm)',
    align: 'right',
    cell: (m) =>
      `${m.waistCm ?? '—'} / ${m.hipCm ?? '—'} / ${m.thighCm ?? '—'}`,
  },
];

/** Alblokk címe a kártyán belül (`h3`, 13 px 600). */
const SectionTitle: React.FC<{ id?: string; children: React.ReactNode }> = ({
  id,
  children,
}) => (
  <h3 id={id} className="text-[13px] font-semibold text-foreground">
    {children}
  </h3>
);

/** Címkézett mező: a címke a mező fölött, 5 px réssel (UI-specifikáció 5.2). */
const Field: React.FC<{
  id: string;
  label: string;
  className?: string;
  children: React.ReactNode;
}> = ({ id, label, className, children }) => (
  <div className={cn('flex min-w-0 flex-col gap-[5px]', className)}>
    <Label htmlFor={id}>{label}</Label>
    {children}
  </div>
);

/** Egyszerű lista szegéllyel; az elemek `ListRow`-k. */
const List: React.FC<{ children: React.ReactNode; label: string }> = ({
  children,
  label,
}) => (
  <ul
    aria-label={label}
    className="divide-y divide-border rounded-md border border-border"
  >
    {children}
  </ul>
);

const ListRow: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <li
    className={cn(
      'flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2.5 text-[13px]',
      className,
    )}
  >
    {children}
  </li>
);

const EmptyText: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[13px] text-muted-foreground">{children}</p>
);

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

// Vendégadatlap (UI-specifikáció 5.4, 5.9, 6.4): a lista helyén nyíló kártya, fülenként a
// vendég adataival, tagságaival, bérleteivel és előzményeivel.
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
  const fieldId = useId();
  const photoInputRef = useRef<HTMLInputElement>(null);
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
  const [docType, setDocType] = useState<DocumentType>(
    DocumentType.GDPR_CONSENT,
  );
  const [emailSubject, setEmailSubject] = useState<string>(
    'RE-FORM Stúdió — Tagsági értesítő',
  );
  const [emailBody, setEmailBody] = useState<string>(
    'Kedves Vendégünk! Köszönjük, hogy a RE-FORM Stúdiót választod!',
  );

  useEffect(() => {
    if (!isOpen) return;
    const st =
      (location.state as { guestSubTab?: GuestSheetTab } | null) ?? null;
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
    notify.success('Belső feljegyzés rögzítve.');
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
      'Új havi tagság és aktuális havi esedékesség létrehozva.',
      `${newMembTitle} (${newMembFee.toLocaleString('hu-HU')} Ft/hó)`,
    );
    onRefreshAll?.();
  };

  const handleUpdateMembershipStatus = async (
    membershipId: string,
    status: MembershipStatus,
  ) => {
    await api.updateMembershipStatus(membershipId, { status });
    notify.info(
      `Tagság állapota módosítva: ${MEMBERSHIP_STATUS_LABEL[status].toLocaleLowerCase('hu-HU')}`,
    );
    onRefreshAll?.();
  };

  const handleReverseUsage = async (usageId: string) => {
    if (!reversalReason.trim()) {
      notify.error('A visszavonáshoz add meg az indokot.');
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
    notify.success('Mérési eredmények rögzítve.');
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
        `Fénykép optimalizálva és elmentve (${optimized.savingsPercent}% megtakarítás).`,
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
      'Dokumentum kiküldve a tabletre aláírásra.',
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
    notify.success('E-mail-értesítés elküldve és naplózva.');
    onRefreshAll?.();
  };

  const allUsageLogs = (guest?.passes ?? [])
    .flatMap((p) =>
      (p.usageLogs ?? []).map((u) => ({
        ...u,
        passName: p.passTemplateName ?? 'Bérlet',
      })),
    )
    .sort((a, b) => b.usedAt.localeCompare(a.usedAt));
  // Kezelés csak a levonás (delta < 0); a vásárlás, hosszabbítás, fagyasztás bérlet-előzmény.
  const treatmentLogs = allUsageLogs.filter((u) => u.delta < 0);
  const passHistoryLogs = allUsageLogs.filter((u) => u.delta >= 0);

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
      count: treatmentLogs.length,
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

  const id = (name: string) => `${fieldId}-${name}`;
  const guestName = guest ? `${guest.lastName} ${guest.firstName}` : '';

  const measurementFields: {
    key: string;
    label: string;
    step: string;
    value: string;
    onChange: (value: string) => void;
  }[] = [
    {
      key: 'weight',
      label: 'Testsúly (kg)',
      step: '0.1',
      value: weightKg,
      onChange: setWeightKg,
    },
    {
      key: 'fat',
      label: 'Testzsír (%)',
      step: '0.1',
      value: bodyFatPct,
      onChange: setBodyFatPct,
    },
    {
      key: 'muscle',
      label: 'Izomtömeg (kg)',
      step: '0.1',
      value: muscleMassKg,
      onChange: setMuscleMassKg,
    },
    {
      key: 'visceral',
      label: 'Zsigeri zsír',
      step: '0.5',
      value: visceralFat,
      onChange: setVisceralFat,
    },
    {
      key: 'waist',
      label: 'Derék (cm)',
      step: '0.5',
      value: waistCm,
      onChange: setWaistCm,
    },
    {
      key: 'hip',
      label: 'Csípő (cm)',
      step: '0.5',
      value: hipCm,
      onChange: setHipCm,
    },
    {
      key: 'thigh',
      label: 'Comb (cm)',
      step: '0.5',
      value: thighCm,
      onChange: setThighCm,
    },
    {
      key: 'arm',
      label: 'Kar (cm)',
      step: '0.5',
      value: armCm,
      onChange: setArmCm,
    },
    {
      key: 'chest',
      label: 'Mellkas (cm)',
      step: '0.5',
      value: chestCm,
      onChange: setChestCm,
    },
  ];

  return (
    <Card>
      <CardHeader className="gap-y-3">
        <Button variant="secondary" size="sm" onClick={onClose}>
          <ArrowLeft aria-hidden strokeWidth={1.75} />
          {backLabel}
        </Button>
        <div className="flex min-w-0 items-center gap-3">
          {guest && <Avatar name={guestName} size="lg" />}
          <div className="min-w-0">
            <CardTitle>
              {guest ? `Vendégadatlap: ${guestName}` : 'Új vendég felvétele'}
            </CardTitle>
            {guest && (
              <p className="font-mono text-xs text-muted-foreground">
                {guest.barcode}
                {guest.phone && ` · ${guest.phone}`}
              </p>
            )}
          </div>
        </div>
        {guest && onOpenDigitalCard && (
          <CardActions>
            <Button
              variant="secondary"
              onClick={() => onOpenDigitalCard(guest)}
            >
              <QrCode aria-hidden strokeWidth={1.75} />
              Digitális kártya
            </Button>
          </CardActions>
        )}
      </CardHeader>

      {/* Fülek (csak meglévő vendégnél) */}
      {guest && (
        <div className="border-b border-border px-4 py-3">
          <ToggleGroup
            type="single"
            aria-label="Az adatlap részei"
            value={activeTab}
            onValueChange={(value) => {
              if (value) handleSelectTab(value as GuestSheetTab);
            }}
          >
            {tabs.map((t) => (
              <ToggleGroupItem key={t.id} value={t.id}>
                {t.label}
                {typeof t.count === 'number' && t.count > 0 && (
                  <span className="rounded-full border border-border bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
                    {t.count}
                  </span>
                )}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}

      <div className="space-y-6 p-3.5 md:p-4">
        {/* ÁTTEKINTÉS ÉS BELSŐ FELJEGYZÉSEK */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <form onSubmit={handleSubmitBasic} className="space-y-3.5">
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                <Field id={id('lastName')} label="Vezetéknév *">
                  <Input
                    id={id('lastName')}
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Pl. Kovács"
                    autoComplete="family-name"
                  />
                </Field>
                <Field id={id('firstName')} label="Keresztnév *">
                  <Input
                    id={id('firstName')}
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Pl. Anna"
                    autoComplete="given-name"
                  />
                </Field>
                <Field id={id('barcode')} label="Vonalkód / kártyaszám">
                  <Input
                    id={id('barcode')}
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="Üresen hagyva automatikus"
                    className="font-mono"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                <Field id={id('phone')} label="Telefonszám">
                  <Input
                    id={id('phone')}
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+36 30 555 1234"
                    autoComplete="tel"
                  />
                </Field>
                <Field id={id('email')} label="E-mail-cím">
                  <Input
                    id={id('email')}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="vendeg@email.hu"
                    autoComplete="email"
                  />
                </Field>
                <Field id={id('birthDate')} label="Születési dátum">
                  <Input
                    id={id('birthDate')}
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                  />
                </Field>
                <Field id={id('nameDay')} label="Névnap (HH-NN, pl. 07-26)">
                  <Input
                    id={id('nameDay')}
                    value={nameDay}
                    onChange={(e) => setNameDay(e.target.value)}
                    placeholder="07-26"
                  />
                </Field>
              </div>

              <Field
                id={id('notes')}
                label="Gyors összefoglaló / egészségügyi megjegyzés"
              >
                <Input
                  id={id('notes')}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Pl. Hypoxi és köredzés kombinált vendég"
                />
              </Field>

              <div className="flex justify-end">
                <Button type="submit" variant="primary">
                  {guest ? 'Alapadatok mentése' : 'Vendég létrehozása'}
                </Button>
              </div>
            </form>

            {/* Belső feljegyzések napló (6.4) */}
            {guest && (
              <section
                aria-labelledby={id('notesTitle')}
                className="space-y-3 border-t border-border pt-5"
              >
                <SectionTitle id={id('notesTitle')}>
                  Belső feljegyzések
                </SectionTitle>
                <p className="text-xs text-muted-foreground">
                  Csak a munkatársak látják.
                </p>
                <form
                  onSubmit={handleAddInternalNote}
                  className="flex flex-col gap-2 sm:flex-row"
                >
                  <Label htmlFor={id('newNote')} className="sr-only">
                    Új belső feljegyzés
                  </Label>
                  <Input
                    id={id('newNote')}
                    value={newInternalNote}
                    onChange={(e) => setNewInternalNote(e.target.value)}
                    placeholder="Új belső feljegyzés a vendéghez"
                  />
                  <Button type="submit" variant="secondary">
                    Feljegyzés hozzáadása
                  </Button>
                </form>
                {(guest.internalNotes ?? []).length > 0 && (
                  <List label="Belső feljegyzések">
                    {(guest.internalNotes ?? []).map((n) => (
                      <ListRow key={n.id}>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">
                            {n.content}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Írta: {n.authorName}
                          </p>
                        </div>
                        <span className="font-mono text-xs text-muted-foreground">
                          {formatDateTime(n.createdAt)}
                        </span>
                      </ListRow>
                    ))}
                  </List>
                )}
              </section>
            )}
          </div>
        )}

        {/* HAVI TAGSÁGOK ÉS ESEDÉKESSÉGEK */}
        {guest && activeTab === 'memberships' && (
          <div className="space-y-5">
            <form
              onSubmit={handleCreateMembership}
              className="space-y-3.5 rounded-lg border border-border p-4"
            >
              <SectionTitle>Új havi tagság</SectionTitle>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-4">
                <Field
                  id={id('membTitle')}
                  label="Megnevezés"
                  className="sm:col-span-2"
                >
                  <Input
                    id={id('membTitle')}
                    value={newMembTitle}
                    onChange={(e) => setNewMembTitle(e.target.value)}
                  />
                </Field>
                <Field id={id('membFee')} label="Egyedi havidíj (Ft/hó)">
                  <Input
                    id={id('membFee')}
                    type="number"
                    value={newMembFee}
                    onChange={(e) => setNewMembFee(Number(e.target.value))}
                    className="text-right tabular-nums"
                  />
                </Field>
                <Field id={id('membDueDay')} label="Fordulónap (1–28)">
                  <Input
                    id={id('membDueDay')}
                    type="number"
                    min={1}
                    max={28}
                    value={newMembDueDay}
                    onChange={(e) => setNewMembDueDay(Number(e.target.value))}
                    className="text-right tabular-nums"
                  />
                </Field>
              </div>
              <div className="flex justify-end">
                <Button type="submit" variant="primary">
                  Tagság létrehozása
                </Button>
              </div>
            </form>

            {(guest.memberships ?? []).length === 0 ? (
              <EmptyText>Ennek a vendégnek még nincs havi tagsága.</EmptyText>
            ) : (
              (guest.memberships ?? []).map((m) => {
                const isActive = m.status === MembershipStatus.ACTIVE;
                return (
                  <div
                    key={m.id}
                    className="space-y-3 rounded-lg border border-border p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <SectionTitle>Havi köredzés tagság</SectionTitle>
                          <Badge variant={isActive ? 'success' : 'secondary'}>
                            {MEMBERSHIP_STATUS_LABEL[m.status]}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Egyedi havidíj:{' '}
                          <span className="font-medium text-foreground">
                            {m.monthlyFeeHuf.toLocaleString('hu-HU')} Ft/hó
                          </span>{' '}
                          · Esedékesség: minden hónap {m.dueDay}. napja
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          handleUpdateMembershipStatus(
                            m.id,
                            isActive
                              ? MembershipStatus.PAUSED
                              : MembershipStatus.ACTIVE,
                          )
                        }
                      >
                        {isActive ? (
                          <PauseCircle aria-hidden strokeWidth={1.75} />
                        ) : (
                          <PlayCircle aria-hidden strokeWidth={1.75} />
                        )}
                        {isActive ? 'Szüneteltetés' : 'Aktiválás'}
                      </Button>
                    </div>

                    {(m.dues ?? []).length > 0 && (
                      <List label="Havi esedékességek és hátralék">
                        {(m.dues ?? []).map((d) => (
                          <ListRow key={d.id} className="text-xs">
                            <span>
                              <span className="font-semibold text-foreground">
                                {d.period}
                              </span>{' '}
                              <span className="text-muted-foreground">
                                (esedékes: {formatDate(d.dueDate)})
                              </span>
                            </span>
                            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
                              <span className="text-muted-foreground">
                                Előírt: {d.amountHuf.toLocaleString('hu-HU')} Ft
                                · Fizetett:{' '}
                                {d.paidAmountHuf.toLocaleString('hu-HU')} Ft
                              </span>
                              <span
                                className={cn(
                                  'font-semibold',
                                  d.remainingHuf > 0
                                    ? 'text-destructive'
                                    : 'text-success',
                                )}
                              >
                                Hátralék:{' '}
                                {d.remainingHuf.toLocaleString('hu-HU')} Ft (
                                {DUE_STATUS_LABEL[d.status]})
                              </span>
                            </span>
                          </ListRow>
                        ))}
                      </List>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* BÉRLETEK */}
        {guest && activeTab === 'passes' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <SectionTitle>
                Bérletek ({guest.passes?.length ?? 0} db)
              </SectionTitle>
              <Field
                id={id('extendReason')}
                label="Módosítás indoka"
                className="w-full sm:w-64"
              >
                <Input
                  id={id('extendReason')}
                  value={extendReason}
                  onChange={(e) => setExtendReason(e.target.value)}
                  placeholder="Pl. igazolt hiányzás"
                />
              </Field>
            </div>

            {(guest.passes ?? []).length === 0 && (
              <EmptyText>Ennek a vendégnek még nincs bérlete.</EmptyText>
            )}
            {(guest.passes ?? []).map((pass) => {
              const badge = PASS_STATUS_BADGE[pass.status];
              const passName = pass.passTemplateName ?? 'Bérlet';
              return (
                <div
                  key={pass.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-4"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-semibold text-foreground">
                        {passName}
                      </span>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Fennmaradó:{' '}
                      <span className="font-medium text-foreground tabular-nums">
                        {formatRemainingPasses(pass)}
                      </span>{' '}
                      (felhasznált: {pass.usedPassesCount ?? 0}) · Lejárat:{' '}
                      <span className="font-medium text-foreground">
                        {formatDate(pass.expirationDate)}
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {[7, 14, 30].map((days) => (
                      <Button
                        key={days}
                        variant="secondary"
                        size="sm"
                        aria-label={`${passName} hosszabbítása ${days} nappal`}
                        onClick={() =>
                          onExtendPass?.(
                            pass.id,
                            days,
                            extendReason || 'Admin hosszabbítás',
                          )
                        }
                      >
                        <CalendarPlus aria-hidden strokeWidth={1.75} />+{days}{' '}
                        nap
                      </Button>
                    ))}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        onToggleFreezePass?.(pass.id, extendReason)
                      }
                    >
                      {pass.isFrozen ? (
                        <Sun aria-hidden strokeWidth={1.75} />
                      ) : (
                        <Snowflake aria-hidden strokeWidth={1.75} />
                      )}
                      {pass.isFrozen ? 'Feloldás' : 'Fagyasztás'}
                    </Button>
                  </div>
                </div>
              );
            })}

            {passHistoryLogs.length > 0 && (
              <section
                className="space-y-2 pt-2"
                aria-labelledby={id('passHistory')}
              >
                <SectionTitle id={id('passHistory')}>
                  Bérlet-előzmények
                </SectionTitle>
                <List label="Bérlet-előzmények">
                  {passHistoryLogs.map((u) => (
                    <ListRow key={u.id}>
                      <div className="min-w-0">
                        <p>
                          <span className="font-medium text-foreground">
                            {u.passName}
                          </span>
                          {u.note && (
                            <span className="text-muted-foreground">
                              {' '}
                              · {u.note}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Rögzítette: {u.employeeName ?? 'Recepció'} ·{' '}
                          {formatDateTime(u.usedAt)}
                        </p>
                      </div>
                    </ListRow>
                  ))}
                </List>
              </section>
            )}
          </div>
        )}

        {/* KEZELÉSI ELŐZMÉNYEK ÉS VISSZAVONÁS */}
        {guest && activeTab === 'treatments' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <SectionTitle>
                Kezelési előzmények (alkalomlevonások)
              </SectionTitle>
              <Field
                id={id('reversalReason')}
                label="Visszavonás indoka"
                className="w-full sm:w-72"
              >
                <Input
                  id={id('reversalReason')}
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="Pl. téves rögzítés"
                />
              </Field>
            </div>

            {treatmentLogs.length === 0 ? (
              <EmptyText>
                Még nincs rögzített kezeléslevonás ennél a vendégnél.
              </EmptyText>
            ) : (
              <List label="Kezelési előzmények">
                {treatmentLogs.map((u) => {
                  const treatmentName = u.serviceName ?? u.passName;
                  return (
                    <ListRow key={u.id}>
                      <div className="min-w-0">
                        <p
                          className={cn(
                            u.reversedAt &&
                              'text-muted-foreground line-through',
                          )}
                        >
                          <span className="font-medium">{treatmentName}</span>
                          {u.note && <span> · {u.note}</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Rögzítette: {u.employeeName ?? 'Recepció'} ·{' '}
                          {formatDateTime(u.usedAt)}
                        </p>
                      </div>
                      {u.reversedAt ? (
                        <Badge variant="secondary">
                          Visszavonva
                          {u.reversalReason ? ` (${u.reversalReason})` : ''}
                        </Badge>
                      ) : (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="secondary" size="sm">
                              <RotateCcw aria-hidden strokeWidth={1.75} />
                              Levonás visszavonása
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Levonás visszavonása
                              </AlertDialogTitle>
                            </AlertDialogHeader>
                            <AlertDialogBody>
                              <AlertDialogDescription>
                                {guestName} „{treatmentName}” levonása
                                visszavonódik, és az alkalom visszakerül a
                                bérletre. Indok: {reversalReason || '—'}.
                              </AlertDialogDescription>
                            </AlertDialogBody>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Mégse</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleReverseUsage(u.id)}
                              >
                                Levonás visszavonása
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </ListRow>
                  );
                })}
              </List>
            )}
          </div>
        )}

        {/* BEFIZETÉSEK */}
        {guest && activeTab === 'payments' && (
          <div className="space-y-3">
            <SectionTitle>
              Pénzügyi tranzakciók ({guest.payments?.length ?? 0} db)
            </SectionTitle>
            <div className="overflow-hidden rounded-md border border-border">
              <ResponsiveTable
                caption="A vendég befizetései"
                columns={PAYMENT_COLUMNS}
                rows={guest.payments ?? []}
                getRowId={(p) => p.id}
                emptyText="Még nincs befizetés ennél a vendégnél."
              />
            </div>
          </div>
        )}

        {/* MÉRÉSEK (6.1) */}
        {guest && activeTab === 'measurements' && (
          <div className="space-y-5">
            <form
              onSubmit={handleAddMeasurement}
              className="space-y-3.5 rounded-lg border border-border p-4"
            >
              <SectionTitle>Új testösszetétel- és körméretmérés</SectionTitle>
              <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
                {measurementFields.map((f) => (
                  <Field key={f.key} id={id(f.key)} label={f.label}>
                    <Input
                      id={id(f.key)}
                      type="number"
                      step={f.step}
                      value={f.value}
                      onChange={(e) => f.onChange(e.target.value)}
                      className="text-right tabular-nums"
                    />
                  </Field>
                ))}
              </div>
              <div className="flex justify-end">
                <Button type="submit" variant="primary">
                  Mérés mentése
                </Button>
              </div>
            </form>

            <div className="overflow-hidden rounded-md border border-border">
              <ResponsiveTable
                caption="Mérési eredmények"
                columns={MEASUREMENT_COLUMNS}
                rows={guest.measurements ?? []}
                getRowId={(m) => m.id}
                emptyText="Még nincs rögzített mérés."
              />
            </div>
          </div>
        )}

        {/* FÉNYKÉPEK AUTOMATIKUS TÖMÖRÍTÉSSEL (6.2) */}
        {guest && activeTab === 'photos' && (
          <div className="space-y-5">
            <div className="space-y-3.5 rounded-lg border border-border p-4">
              <div className="space-y-1">
                <SectionTitle>Kezelési állapotfotó feltöltése</SectionTitle>
                <p className="text-xs text-muted-foreground">
                  Automatikus átméretezés (max. 1600 px), EXIF-eltávolítás és
                  WebP-tömörítés, jellemzően 80–90% tárhely-megtakarítással.
                </p>
              </div>

              <div className="grid grid-cols-1 items-end gap-3.5 sm:grid-cols-3">
                <Field id={id('photoService')} label="Kezelés">
                  <Select
                    value={photoServiceId}
                    onValueChange={setPhotoServiceId}
                  >
                    <SelectTrigger id={id('photoService')}>
                      <SelectValue placeholder="Válassz kezelést" />
                    </SelectTrigger>
                    <SelectContent>
                      {services.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field id={id('photoNote')} label="Megjegyzés">
                  <Input
                    id={id('photoNote')}
                    value={photoNotes}
                    onChange={(e) => setPhotoNotes(e.target.value)}
                    placeholder="Pl. 1. alkalom előtt, szemből"
                  />
                </Field>
                <div>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoFileChange}
                    className="hidden"
                    tabIndex={-1}
                    aria-hidden
                  />
                  <Button
                    type="button"
                    variant="primary"
                    className="w-full"
                    disabled={isOptimizingPhoto}
                    onClick={() => photoInputRef.current?.click()}
                  >
                    <Upload aria-hidden strokeWidth={1.75} />
                    {isOptimizingPhoto
                      ? 'Optimalizálás…'
                      : 'Kép kiválasztása és tömörítése'}
                  </Button>
                </div>
              </div>

              {lastCompressionInfo && (
                <div
                  aria-live="polite"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2.5 text-xs text-muted-foreground"
                >
                  <span>
                    Legutóbbi optimalizálás:{' '}
                    <span className="font-medium text-foreground">
                      {formatBytes(lastCompressionInfo.originalBytes)}
                    </span>{' '}
                    →{' '}
                    <span className="font-medium text-foreground">
                      {formatBytes(lastCompressionInfo.compressedBytes)}
                    </span>{' '}
                    ({lastCompressionInfo.width}×{lastCompressionInfo.height}{' '}
                    px)
                  </span>
                  <Badge variant="success">
                    −{lastCompressionInfo.savedPercent}% fájlméret
                  </Badge>
                </div>
              )}
            </div>

            {(guest.photos ?? []).length === 0 ? (
              <EmptyText>Még nincs feltöltött fénykép.</EmptyText>
            ) : (
              <ul
                aria-label="Fényképek"
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                {(guest.photos ?? []).map((ph) => {
                  const savedPct =
                    ph.originalSizeBytes > 0
                      ? Math.round(
                          (1 - ph.compressedSizeBytes / ph.originalSizeBytes) *
                            100,
                        )
                      : 0;
                  return (
                    <li
                      key={ph.id}
                      className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm"
                    >
                      <img
                        src={ph.fileUrl}
                        alt={ph.note ?? 'Kezelési fotó'}
                        className="h-44 w-full bg-muted object-cover"
                      />
                      <div className="space-y-1 p-3 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-semibold text-foreground">
                            {ph.serviceName ?? 'Állapotfotó'}
                          </span>
                          <span className="font-mono text-muted-foreground">
                            −{savedPct}% ({formatBytes(ph.compressedSizeBytes)})
                          </span>
                        </div>
                        {ph.note && (
                          <p className="text-muted-foreground">{ph.note}</p>
                        )}
                        <p className="font-mono text-muted-foreground">
                          {formatDateTime(ph.takenAt)} · {ph.width}×{ph.height}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* DOKUMENTUMOK, TABLET ALÁÍRÁS ÉS E-MAIL NAPLÓ (6.3, 6.4) */}
        {guest && activeTab === 'documents' && (
          <div className="space-y-5">
            <div className="space-y-3.5 rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SectionTitle>
                  Dokumentum kiküldése tabletre aláírásra
                </SectionTitle>
                <Button variant="link" asChild>
                  <Link to="/tablet">Tablet aláíró nézet megnyitása</Link>
                </Button>
              </div>

              <form
                onSubmit={handleCreatePendingDocument}
                className="grid grid-cols-1 items-end gap-3.5 sm:grid-cols-3"
              >
                <Field id={id('docTitle')} label="Dokumentum címe">
                  <Input
                    id={id('docTitle')}
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                  />
                </Field>
                <Field id={id('docType')} label="Típus">
                  <Select
                    value={docType}
                    onValueChange={(value) => setDocType(value as DocumentType)}
                  >
                    <SelectTrigger id={id('docType')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Button type="submit" variant="primary">
                  Kiküldés tabletre
                </Button>
              </form>

              {(guest.documents ?? []).length > 0 && (
                <List label="Dokumentumok">
                  {(guest.documents ?? []).map((doc) => (
                    <ListRow key={doc.id}>
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-foreground">
                            {doc.title}
                          </span>
                          {doc.status === DocumentStatus.SIGNED ? (
                            <Badge variant="success">Aláírva (zárolt)</Badge>
                          ) : (
                            <Badge variant="warning">Aláírásra vár</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {doc.signedAt
                            ? `Aláírva: ${formatDateTime(doc.signedAt)}`
                            : `Létrehozva: ${formatDateTime(doc.createdAt)}`}
                        </p>
                      </div>
                      {doc.signatureDataUrl && (
                        // Sötét tinta átlátszó háttéren: mindkét témában fehér „papíron” olvasható.
                        <img
                          src={doc.signatureDataUrl}
                          alt={`${doc.title}: aláírás`}
                          className="barcode-white-box h-10 rounded-sm border border-border bg-white px-2"
                        />
                      )}
                    </ListRow>
                  ))}
                </List>
              )}
            </div>

            {/* E-mail kommunikációs napló */}
            <div className="space-y-3.5 rounded-lg border border-border p-4">
              <SectionTitle>Kimenő e-mail-értesítés és napló</SectionTitle>
              <form
                onSubmit={handleSendEmailLog}
                className="grid grid-cols-1 items-end gap-3.5 sm:grid-cols-3"
              >
                <Field id={id('emailSubject')} label="Tárgy">
                  <Input
                    id={id('emailSubject')}
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                  />
                </Field>
                <Field id={id('emailBody')} label="Üzenet">
                  <Input
                    id={id('emailBody')}
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                  />
                </Field>
                <Button type="submit" variant="secondary">
                  E-mail küldése és naplózása
                </Button>
              </form>

              {(guest.messageLogs ?? []).length > 0 && (
                <List label="Elküldött e-mailek">
                  {(guest.messageLogs ?? []).map((msg) => (
                    <ListRow key={msg.id}>
                      <div className="min-w-0">
                        <p>
                          <span className="font-medium text-foreground">
                            {msg.subject}
                          </span>{' '}
                          <span className="text-muted-foreground">
                            → {msg.recipientEmail}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {msg.messageType}
                        </p>
                      </div>
                      <span className="font-mono text-xs text-muted-foreground">
                        {msg.status} ({formatDate(msg.sentAt)})
                      </span>
                    </ListRow>
                  ))}
                </List>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};
