import type { LoginResponseDto } from './contracts';
import { Gender } from './enums';

// Tabletes vendégfelvétel (TICKET-56): állapotgép, kérdőív-logika, duplikáció-ellenőrzés és a
// hiányzó dokumentumok számítása. Egyetlen forrás: az API (`intake` modul) és a kliensoldali
// mock (`mock-engine.ts`) is ezeket a tiszta függvényeket hívja.

/** A dokumentumszövegek jelölése, amíg a jogi és szakmai felülvizsgálat nem történt meg. */
export const INTAKE_LEGAL_REVIEW_LABEL = 'Jogi és szakmai felülvizsgálatra vár';
/** A vendégmód munkamenet-tokenje ennyi ideig érvényes (egy kitöltéshez kötött). */
export const INTAKE_GUEST_TOKEN_TTL_MINUTES = 120;
/** A vendégmódból kilépő munkatársi kód ennyi hibás próbálkozást enged. */
export const INTAKE_EXIT_MAX_ATTEMPTS = 5;
/** A profilkép (data URL) legnagyobb mérete, bájtban. */
export const INTAKE_PHOTO_MAX_BYTES = 750 * 1024;
/** Az aláírás (PNG data URL) legnagyobb mérete, bájtban. */
export const INTAKE_SIGNATURE_MAX_BYTES = 400 * 1024;
/** A vendégmód kérései ebben a fejlécben viszik a munkamenet-tokent. */
export const INTAKE_TOKEN_HEADER = 'x-intake-token';
/** A párosított tablet kérései ebben a fejlécben viszik az eszköztokent. */
export const DEVICE_TOKEN_HEADER = 'x-device-token';

export enum IntakeStatus {
  /** A recepciós előkészítette, a vendég még nem kezdte el. */
  PREPARED = 'PREPARED',
  GUEST_FILLING = 'GUEST_FILLING',
  /** A vendég aláírta és beküldte, a recepció ellenőrzésére vár. */
  AWAITING_REVIEW = 'AWAITING_REVIEW',
  /** Jóváhagyva, a vendégprofil szinkronizálva; a PDF-ek még nem készültek el. */
  APPROVED = 'APPROVED',
  /** Aláírva és lezárva: a PDF-ek a tárolóban vannak. */
  COMPLETED = 'COMPLETED',
  /** A lezárás (PDF, tárolás) nem sikerült; újrapróbálható. */
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export type IntakeEvent =
  | 'GUEST_STARTED'
  | 'GUEST_SUBMITTED'
  | 'RETURNED_TO_GUEST'
  | 'APPROVED'
  | 'FINALIZED'
  | 'FINALIZE_FAILED'
  | 'RETRY'
  | 'CANCELLED';

export const INTAKE_STATUS_LABELS: Record<IntakeStatus, string> = {
  [IntakeStatus.PREPARED]: 'Előkészítve',
  [IntakeStatus.GUEST_FILLING]: 'Vendég kitölti',
  [IntakeStatus.AWAITING_REVIEW]: 'Ellenőrzésre vár',
  [IntakeStatus.APPROVED]: 'Jóváhagyva',
  [IntakeStatus.COMPLETED]: 'Aláírva, lezárva',
  [IntakeStatus.FAILED]: 'Hiba, újrapróbálható',
  [IntakeStatus.CANCELLED]: 'Megszakítva',
};

const TRANSITIONS: Record<IntakeStatus, Partial<Record<IntakeEvent, IntakeStatus>>> = {
  [IntakeStatus.PREPARED]: {
    GUEST_STARTED: IntakeStatus.GUEST_FILLING,
    CANCELLED: IntakeStatus.CANCELLED,
  },
  [IntakeStatus.GUEST_FILLING]: {
    GUEST_STARTED: IntakeStatus.GUEST_FILLING,
    GUEST_SUBMITTED: IntakeStatus.AWAITING_REVIEW,
    CANCELLED: IntakeStatus.CANCELLED,
  },
  [IntakeStatus.AWAITING_REVIEW]: {
    RETURNED_TO_GUEST: IntakeStatus.GUEST_FILLING,
    APPROVED: IntakeStatus.APPROVED,
    CANCELLED: IntakeStatus.CANCELLED,
  },
  [IntakeStatus.APPROVED]: {
    FINALIZED: IntakeStatus.COMPLETED,
    FINALIZE_FAILED: IntakeStatus.FAILED,
  },
  [IntakeStatus.FAILED]: {
    RETRY: IntakeStatus.APPROVED,
  },
  [IntakeStatus.COMPLETED]: {},
  [IntakeStatus.CANCELLED]: {},
};

/** Az esemény utáni állapot; `null`, ha az átmenet nem megengedett. */
export function nextIntakeStatus(
  status: IntakeStatus,
  event: IntakeEvent,
): IntakeStatus | null {
  return TRANSITIONS[status]?.[event] ?? null;
}

/** A vendég a tableten csak ezekben az állapotokban írhat. */
export function isIntakeEditableByGuest(status: IntakeStatus): boolean {
  return status === IntakeStatus.PREPARED || status === IntakeStatus.GUEST_FILLING;
}

/** Lezáratlan munkamenet (tablethez rendelhető, megszakítható). */
export function isIntakeOpen(status: IntakeStatus): boolean {
  return nextIntakeStatus(status, 'CANCELLED') !== null;
}

// ---------------------------------------------------------------------------------------------
// Kérdőív-definíciók (adatvezérelt, verziózott; a beépítettek: `intake-forms.ts`)
// ---------------------------------------------------------------------------------------------

export type IntakeFormKind =
  /** Tájékoztató (adatkezelés): elolvasás igazolása, aláírás nélkül. */
  | 'NOTICE'
  /** Vendég törzsadatai: a válaszok a profil mezőibe kerülnek. */
  | 'PROFILE'
  /** Az egészségügyi adatok kezeléséhez adott hozzájárulás (az egészségügyi kérdések előtt). */
  | 'HEALTH_CONSENT'
  /** Egészségügyi kérdőív: a válaszok külön táblába kerülnek. */
  | 'HEALTH'
  /** Szolgáltatásspecifikus ellenjavallatok (szintén egészségügyi adat). */
  | 'CONTRAINDICATIONS'
  | 'CONTRACT'
  | 'CONSENT';

/** Az egészségügyi adatnak számító űrlapok: a válaszaik külön táblában, auditálva. */
export function isHealthForm(kind: IntakeFormKind): boolean {
  return kind === 'HEALTH' || kind === 'CONTRAINDICATIONS';
}

export type IntakeQuestionType =
  | 'YES_NO'
  | 'SINGLE_CHOICE'
  | 'MULTI_CHOICE'
  | 'TEXT'
  | 'EMAIL'
  | 'PHONE'
  | 'DATE'
  /** Kötelező elfogadás (jelölőnégyzet); értéke `ACCEPTED`. */
  | 'ACCEPT';

export type IntakeProfileField =
  | 'lastName'
  | 'firstName'
  | 'birthDate'
  | 'phone'
  | 'email'
  | 'gender';

export interface IntakeQuestionOption {
  value: string;
  label: string;
}

export interface IntakeQuestion {
  id: string;
  label: string;
  type: IntakeQuestionType;
  options?: IntakeQuestionOption[];
  required?: boolean;
  help?: string;
  /** Csak akkor látszik (és csak akkor kötelező), ha a megadott kérdés válasza ez. */
  showIf?: { questionId: string; equals: string };
  /** Kockázatot jelző válasz: a figyelmeztetés közvetlenül a kérdés alatt jelenik meg. */
  warning?: { values: string[]; text: string };
  /** `PROFILE` űrlapon: melyik profilmezőbe kerül. */
  profileField?: IntakeProfileField;
}

export interface IntakeFormDefinitionDto {
  key: string;
  version: number;
  title: string;
  kind: IntakeFormKind;
  /** `COMMON`: minden csomaghoz; egyébként a csomag kulcsa. */
  scope: string;
  /** A kitöltés sorrendje. */
  order: number;
  bodyText: string;
  questions: IntakeQuestion[];
  /** Az aláírt változata pillanatképként és PDF-ként megmarad. */
  requiresSignature: boolean;
  legalReviewPending: boolean;
}

export interface IntakePackageDto {
  key: string;
  label: string;
  description: string;
  /** A csomag szolgáltatásspecifikus űrlapjai (a közösek mindig hozzáadódnak). */
  formKeys: string[];
}

export type IntakeAnswerValue = string | string[];
export type IntakeAnswers = Record<string, IntakeAnswerValue>;
/** Űrlapkulcs → válaszok. */
export type IntakeAnswerSet = Record<string, IntakeAnswers>;

const isEmptyAnswer = (value: IntakeAnswerValue | undefined): boolean =>
  value === undefined ||
  (Array.isArray(value) ? value.length === 0 : value.trim().length === 0);

export function isQuestionVisible(question: IntakeQuestion, answers: IntakeAnswers): boolean {
  if (!question.showIf) return true;
  return answers[question.showIf.questionId] === question.showIf.equals;
}

/** A látható, kötelező, de megválaszolatlan kérdések azonosítói. */
export function missingRequiredAnswers(
  form: Pick<IntakeFormDefinitionDto, 'questions'>,
  answers: IntakeAnswers,
): string[] {
  return form.questions
    .filter((q) => q.required && isQuestionVisible(q, answers))
    .filter((q) =>
      q.type === 'ACCEPT' ? answers[q.id] !== 'ACCEPTED' : isEmptyAnswer(answers[q.id]),
    )
    .map((q) => q.id);
}

export interface IntakeWarning {
  formKey: string;
  questionId: string;
  text: string;
}

/**
 * Figyelmeztetések: csak a látható kérdés kockázatot jelző válaszánál (pl. „Igen” a friss
 * műtétre); a felület közvetlenül az érintett kérdés alatt mutatja.
 */
export function intakeWarnings(
  form: Pick<IntakeFormDefinitionDto, 'key' | 'questions'>,
  answers: IntakeAnswers,
): IntakeWarning[] {
  return form.questions.flatMap((q) => {
    if (!q.warning || !isQuestionVisible(q, answers)) return [];
    const value = answers[q.id];
    const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
    return values.some((v) => q.warning!.values.includes(v))
      ? [{ formKey: form.key, questionId: q.id, text: q.warning.text }]
      : [];
  });
}

/** A rejtett (feltételhez kötött, de most nem látható) kérdések válaszait elhagyja. */
export function pruneHiddenAnswers(
  form: Pick<IntakeFormDefinitionDto, 'questions'>,
  answers: IntakeAnswers,
): IntakeAnswers {
  const known = new Map(form.questions.map((q) => [q.id, q]));
  return Object.fromEntries(
    Object.entries(answers).filter(([id]) => {
      const question = known.get(id);
      return question !== undefined && isQuestionVisible(question, answers);
    }),
  );
}

/**
 * A csomagokhoz szükséges űrlapok sorrendben: a közösek és a választott csomagok
 * szolgáltatásspecifikus űrlapjai, ismétlés nélkül.
 */
export function requiredIntakeForms(
  forms: IntakeFormDefinitionDto[],
  packages: IntakePackageDto[],
  packageKeys: string[],
): IntakeFormDefinitionDto[] {
  const selected = packages.filter((p) => packageKeys.includes(p.key));
  const keys = new Set(selected.flatMap((p) => p.formKeys));
  return forms
    .filter((f) => f.scope === 'COMMON' || keys.has(f.key))
    .sort((a, b) => a.order - b.order);
}

/**
 * Több szolgáltatásnál egy profil marad: a vendégtől csak azok az űrlapok kellenek, amelyeket
 * még nem írt alá (bármelyik verzióját). Új vendégnél minden szükséges űrlap kell.
 */
export function missingIntakeForms(
  required: IntakeFormDefinitionDto[],
  signedFormKeys: Iterable<string>,
): IntakeFormDefinitionDto[] {
  const signed = new Set(signedFormKeys);
  return required.filter((f) => !signed.has(f.key));
}

// ---------------------------------------------------------------------------------------------
// Profil, mérések
// ---------------------------------------------------------------------------------------------

export interface IntakeProfileDraft {
  lastName?: string;
  firstName?: string;
  /** `YYYY-MM-DD` */
  birthDate?: string | null;
  phone?: string | null;
  email?: string | null;
  gender?: Gender;
}

const GENDER_VALUES = new Set<string>(Object.values(Gender));

/** A `PROFILE` űrlap válaszaiból a profil mezői. */
export function profileFromAnswers(
  form: Pick<IntakeFormDefinitionDto, 'questions'>,
  answers: IntakeAnswers,
): IntakeProfileDraft {
  const profile: IntakeProfileDraft = {};
  for (const q of form.questions) {
    const value = answers[q.id];
    if (!q.profileField || typeof value !== 'string' || !value.trim()) continue;
    if (q.profileField === 'gender') {
      if (GENDER_VALUES.has(value)) profile.gender = value as Gender;
    } else {
      profile[q.profileField] = value.trim();
    }
  }
  return profile;
}

/** A profil előtöltése a `PROFILE` űrlap válaszaiként (meglévő vendégnél, előkészítéskor). */
export function answersFromProfile(
  form: Pick<IntakeFormDefinitionDto, 'questions'>,
  profile: IntakeProfileDraft,
): IntakeAnswers {
  const answers: IntakeAnswers = {};
  for (const q of form.questions) {
    const value = q.profileField ? profile[q.profileField] : undefined;
    if (typeof value === 'string' && value.trim()) answers[q.id] = value;
  }
  return answers;
}

export type IntakeMeasurementKey =
  | 'weightKg'
  | 'bmi'
  | 'bodyFatPct'
  | 'skeletalMusclePct'
  | 'restingMetabolismKcal'
  | 'visceralFat'
  | 'armCm'
  | 'chestCm'
  | 'waistCm'
  | 'abdomenCm'
  | 'hipCm'
  | 'thighCm'
  | 'aboveKneeCm'
  | 'calfCm';

export type IntakeMeasurementDraft = Partial<Record<IntakeMeasurementKey, number | null>>;

export interface IntakeMeasurementField {
  key: IntakeMeasurementKey;
  label: string;
  group: 'Testsúly' | 'Omron mérés' | 'Körfogatok';
  step: number;
  max: number;
}

/** A felvételkor rögzített mérések, a felvétel sorrendjében (a mérési előzményekbe kerülnek). */
export const INTAKE_MEASUREMENT_FIELDS: IntakeMeasurementField[] = [
  { key: 'weightKg', label: 'Testsúly (kg)', group: 'Testsúly', step: 0.1, max: 400 },
  { key: 'bmi', label: 'BMI', group: 'Omron mérés', step: 0.1, max: 100 },
  { key: 'bodyFatPct', label: 'Testzsír (%)', group: 'Omron mérés', step: 0.1, max: 100 },
  { key: 'skeletalMusclePct', label: 'Vázizom (%)', group: 'Omron mérés', step: 0.1, max: 100 },
  {
    key: 'restingMetabolismKcal',
    label: 'Nyugalmi anyagcsere (kcal/nap)',
    group: 'Omron mérés',
    step: 1,
    max: 10000,
  },
  { key: 'visceralFat', label: 'Zsigeri zsír', group: 'Omron mérés', step: 0.5, max: 60 },
  { key: 'armCm', label: 'Kar (cm)', group: 'Körfogatok', step: 0.5, max: 300 },
  { key: 'chestCm', label: 'Mellkas (cm)', group: 'Körfogatok', step: 0.5, max: 300 },
  { key: 'waistCm', label: 'Derék (cm)', group: 'Körfogatok', step: 0.5, max: 300 },
  { key: 'abdomenCm', label: 'Has (cm)', group: 'Körfogatok', step: 0.5, max: 300 },
  { key: 'hipCm', label: 'Csípő (cm)', group: 'Körfogatok', step: 0.5, max: 300 },
  { key: 'thighCm', label: 'Comb (cm)', group: 'Körfogatok', step: 0.5, max: 300 },
  { key: 'aboveKneeCm', label: 'Térd felett (cm)', group: 'Körfogatok', step: 0.5, max: 300 },
  { key: 'calfCm', label: 'Vádli (cm)', group: 'Körfogatok', step: 0.5, max: 300 },
];

/** Csak az ismert, véges, nem negatív és a felső határ alatti értékek maradnak meg. */
export function sanitizeIntakeMeasurements(input: unknown): IntakeMeasurementDraft {
  const source = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const result: IntakeMeasurementDraft = {};
  for (const field of INTAKE_MEASUREMENT_FIELDS) {
    const raw = source[field.key];
    if (raw === null || raw === undefined || raw === '') continue;
    const value = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(value) && value >= 0 && value <= field.max) result[field.key] = value;
  }
  return result;
}

export function hasIntakeMeasurements(draft: IntakeMeasurementDraft): boolean {
  return Object.values(draft).some((v) => typeof v === 'number');
}

// ---------------------------------------------------------------------------------------------
// Duplikáció-ellenőrzés
// ---------------------------------------------------------------------------------------------

export type IntakeDuplicateReason = 'NAME_AND_BIRTHDATE' | 'PHONE' | 'EMAIL' | 'NAME';

export const INTAKE_DUPLICATE_REASON_LABELS: Record<IntakeDuplicateReason, string> = {
  NAME_AND_BIRTHDATE: 'név és születési dátum',
  PHONE: 'telefonszám',
  EMAIL: 'e-mail cím',
  NAME: 'név',
};

export interface IntakeDuplicateCandidateGuest {
  id: string;
  firstName: string;
  lastName: string;
  barcode: string;
  birthDate: string | null;
  phone: string | null;
  email: string | null;
}

export interface IntakeDuplicateCandidateDto {
  guestId: string;
  name: string;
  barcode: string;
  birthDate: string | null;
  phone: string | null;
  email: string | null;
  matchedOn: IntakeDuplicateReason[];
}

const normalizePersonName = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Telefonszám-összehasonlítás: csak számjegyek, a `06` előtag `36`, az utolsó 9 jegy dönt. */
const normalizePhone = (value: string | null | undefined): string => {
  const digits = (value ?? '').replace(/\D/g, '').replace(/^06/, '36');
  return digits.length >= 9 ? digits.slice(-9) : '';
};

const normalizeEmail = (value: string | null | undefined): string =>
  (value ?? '').trim().toLowerCase();

/**
 * Lehetséges duplikátumok: azonos név és születési dátum, telefonszám vagy e-mail cím. A puszta
 * névegyezés is jelez (gyengébb ok), ha nincs születési dátum, amivel kizárható lenne.
 */
export function findIntakeDuplicates(
  profile: IntakeProfileDraft,
  guests: IntakeDuplicateCandidateGuest[],
  excludeGuestId?: string | null,
): IntakeDuplicateCandidateDto[] {
  const name = normalizePersonName(`${profile.lastName ?? ''} ${profile.firstName ?? ''}`);
  const phone = normalizePhone(profile.phone);
  const email = normalizeEmail(profile.email);
  const birthDate = profile.birthDate?.slice(0, 10) || null;

  return guests.flatMap((g) => {
    if (g.id === excludeGuestId) return [];
    const reasons: IntakeDuplicateReason[] = [];
    const sameName =
      name.length > 0 && normalizePersonName(`${g.lastName} ${g.firstName}`) === name;
    const guestBirthDate = g.birthDate?.slice(0, 10) || null;
    if (sameName && birthDate && guestBirthDate === birthDate) {
      reasons.push('NAME_AND_BIRTHDATE');
    } else if (sameName && (!birthDate || !guestBirthDate)) {
      reasons.push('NAME');
    }
    if (phone && normalizePhone(g.phone) === phone) reasons.push('PHONE');
    if (email && normalizeEmail(g.email) === email) reasons.push('EMAIL');
    if (reasons.length === 0) return [];
    return [
      {
        guestId: g.id,
        name: `${g.lastName} ${g.firstName}`,
        barcode: g.barcode,
        birthDate: guestBirthDate,
        phone: g.phone,
        email: g.email,
        matchedOn: reasons,
      },
    ];
  });
}

// ---------------------------------------------------------------------------------------------
// REST szerződések
// ---------------------------------------------------------------------------------------------

export type IntakeSource = 'PC' | 'TABLET';

export interface IntakeDocumentSnapshotDto {
  id: string;
  sessionId: string;
  guestId: string;
  formKey: string;
  formVersion: number;
  title: string;
  signedAt: string;
  legalReviewPending: boolean;
  pdfAvailable: boolean;
  pdfSizeBytes: number | null;
  createdAt: string;
}

export interface IntakeSessionSummaryDto {
  id: string;
  status: IntakeStatus;
  source: IntakeSource;
  guestId: string | null;
  /** A vendég neve (meglévő vendégnél a profil, újnál a kitöltött adatok szerint). */
  guestName: string;
  packageKeys: string[];
  packageLabels: string[];
  assignedDeviceId: string | null;
  assignedDeviceName: string | null;
  createdByName: string;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IntakeSessionDetailDto extends IntakeSessionSummaryDto {
  /** A vendégtől kért (hiányzó) űrlapok, az aláíráskori verzióval. */
  forms: IntakeFormDefinitionDto[];
  profile: IntakeProfileDraft;
  /** A nem egészségügyi űrlapok válaszai (az egészségügyiek: `GET …/health`, auditálva). */
  answers: IntakeAnswerSet;
  measurements: IntakeMeasurementDraft;
  profilePhotoDataUrl: string | null;
  signatureDataUrl: string | null;
  signedAt: string | null;
  /** Új vendégnél a lehetséges duplikátumok; a recepciós választ (új vagy meglévő). */
  duplicates: IntakeDuplicateCandidateDto[];
  /** Jóváhagyáskor ehhez a meglévő vendéghez kerülnek az adatok (új vendég helyett). */
  linkGuestId: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  completedAt: string | null;
  snapshots: IntakeDocumentSnapshotDto[];
}

/** `GET /intake/sessions/:id/health`: egészségügyi válaszok, minden olvasás auditnaplóba kerül. */
export interface IntakeHealthDto {
  sessionId: string;
  answers: IntakeAnswerSet;
  warnings: IntakeWarning[];
  consentGivenAt: string | null;
}

/** A vendégmód nézete: csak ennek a kitöltésnek az adatai. */
export interface IntakeGuestViewDto {
  sessionId: string;
  status: IntakeStatus;
  packageLabels: string[];
  forms: IntakeFormDefinitionDto[];
  answers: IntakeAnswerSet;
  hasProfilePhoto: boolean;
  expiresAt: string;
}

/** Vendégmód indítása: a token a kitöltéshez kötött, a kilépési kód a munkatársé. */
export interface IntakeGuestTokenDto {
  sessionId: string;
  guestToken: string;
  expiresAt: string;
  exitCode: string;
}

export interface IntakeDeviceAssignmentDto {
  sessionId: string;
  guestToken: string;
  expiresAt: string;
}

export interface IntakeSendToDeviceResponseDto {
  sessionId: string;
  deviceId: string;
  deviceName: string;
  exitCode: string;
}

export interface IntakeGuestExitResponseDto {
  released: true;
  /** Ha a vendégmód munkatársi munkamenetből indult ezen az eszközön, az új munkatársi munkamenet. */
  staff?: LoginResponseDto;
}

export interface IntakeDocumentLinkDto {
  /** Lejáró letöltési link (Supabase aláírt URL, vagy helyi tárolónál az API relatív útvonala). */
  url: string;
  expiresAt: string;
}

export interface CreateIntakeSessionRequestDto {
  guestId?: string;
  newGuest?: IntakeProfileDraft;
  packageKeys: string[];
  source: IntakeSource;
  /** A recepciós látta a duplikáció-figyelmeztetést, és mégis új vendéget vesz fel. */
  acknowledgeDuplicates?: boolean;
}

export interface UpdateIntakeSessionRequestDto {
  profile?: IntakeProfileDraft;
  measurements?: IntakeMeasurementDraft;
  /** Meglévő vendéghez kapcsolás (duplikátumnál); `null` = mégis új vendég. */
  linkGuestId?: string | null;
}

export interface IntakeSocketPayload {
  sessionId: string;
  status: IntakeStatus;
}

export interface IntakeDevicePayload {
  sessionId: string;
  deviceId: string;
}
