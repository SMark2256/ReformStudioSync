import {
  answersFromProfile,
  appError,
  AuthUserDto,
  BUILT_IN_INTAKE_FORMS,
  BUILT_IN_INTAKE_PACKAGES,
  CreateIntakeSessionRequestDto,
  findIntakeDuplicates,
  Gender,
  hasIntakeMeasurements,
  hasSignableIntakeForms,
  INTAKE_EXIT_MAX_ATTEMPTS,
  INTAKE_GUEST_TOKEN_TTL_MINUTES,
  INTAKE_PHOTO_MAX_BYTES,
  IntakeAnswers,
  IntakeAnswerSet,
  IntakeDeviceAssignmentDto,
  IntakeDocumentLinkDto,
  IntakeDocumentSnapshotDto,
  IntakeDuplicateCandidateDto,
  IntakeFormDefinitionDto,
  IntakeGuestExitResponseDto,
  IntakeGuestTokenDto,
  IntakeGuestViewDto,
  IntakeHealthDto,
  IntakeMeasurementDraft,
  IntakePackageDto,
  IntakeProfileDraft,
  IntakeSendToDeviceResponseDto,
  IntakeSessionDetailDto,
  IntakeSessionSummaryDto,
  IntakeSource,
  IntakeStatus,
  IntakeWarning,
  intakeWarnings,
  isHealthForm,
  isIntakeEditableByGuest,
  isIntakeOpen,
  missingIntakeForms,
  missingRequiredAnswers,
  nextIntakeStatus,
  IntakeEvent,
  profileFromAnswers,
  pruneHiddenAnswers,
  requiredIntakeForms,
  Role,
  sanitizeIntakeMeasurements,
  UpdateIntakeSessionRequestDto,
} from '@reform/shared';
import { mockStudioEngine } from './mock-engine';

// A vendégfelvétel (TICKET-56) demó/mock párja: ugyanazok a szabályok, mint az API `intake`
// moduljában (a közös tiszta függvényekkel), saját localStorage-kulccsal. A vendég-, mérés- és
// fotóadatokat a fő mock-motor publikus metódusain keresztül írja.

const STORAGE_KEY = 'reform-studio-mock-intake-v1';
const MINUTE_MS = 60 * 1000;
const DOCUMENT_LINK_TTL_MS = 10 * MINUTE_MS;
const PROFILE_PHOTO_NOTE = 'Belső azonosító profilkép (vendégfelvétel)';

interface MockIntakeSession {
  id: string;
  status: IntakeStatus;
  source: IntakeSource;
  guestId: string | null;
  linkGuestId: string | null;
  packageKeys: string[];
  formKeys: string[];
  profile: IntakeProfileDraft;
  /** A nem egészségügyi űrlapok válaszai. */
  answers: IntakeAnswerSet;
  /** Az egészségügyi válaszok: külön tárolva, mint az API-ban. */
  health: IntakeAnswerSet;
  consentGivenAt: string | null;
  measurements: IntakeMeasurementDraft;
  profilePhotoDataUrl: string | null;
  signatureDataUrl: string | null;
  signedAt: string | null;
  guestToken: string | null;
  guestTokenExpiresAt: string | null;
  exitCode: string | null;
  exitAttempts: number;
  handoverUser: AuthUserDto | null;
  assignedDeviceId: string | null;
  createdByName: string;
  approvedByName: string | null;
  approvedAt: string | null;
  completedAt: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MockIntakeSnapshot {
  id: string;
  sessionId: string;
  guestId: string;
  formKey: string;
  formVersion: number;
  title: string;
  bodyText: string;
  answers: IntakeAnswers;
  signatureDataUrl: string;
  signedAt: string;
  legalReviewPending: boolean;
  createdAt: string;
}

export interface MockIntakeAuditEntry {
  action: string;
  entityId: string;
  userId: string | null;
  at: string;
}

export interface MockIntakeState {
  sessions: MockIntakeSession[];
  snapshots: MockIntakeSnapshot[];
  auditLog: MockIntakeAuditEntry[];
}

const emptyState = (): MockIntakeState => ({ sessions: [], snapshots: [], auditLog: [] });

const randomId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const dataUrlBytes = (dataUrl: string) =>
  Math.floor(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4);

const formsFor = (keys: string[]): IntakeFormDefinitionDto[] =>
  keys
    .map((key) => BUILT_IN_INTAKE_FORMS.find((f) => f.key === key))
    .filter((f): f is IntakeFormDefinitionDto => Boolean(f));

const packageLabels = (keys: string[]) =>
  keys.map((key) => BUILT_IN_INTAKE_PACKAGES.find((p) => p.key === key)?.label ?? key);

/** Egyszerű, egyoldalas PDF (csak ASCII): a demó módban a „megnyitás” ezt mutatja. */
function demoPdfDataUrl(snapshot: MockIntakeSnapshot): string {
  const ascii = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\x20-\x7e]/g, '')
      .replace(/[()\\]/g, '');
  const lines = [
    `${ascii(snapshot.title)} - v${snapshot.formVersion}`,
    `Alairva: ${snapshot.signedAt}`,
    'Demo mod: a valodi PDF-et az API kesziti (Noto Sans, alairas kepe).',
  ];
  const text = lines
    .map((line, i) => `BT /F1 12 Tf 50 ${780 - i * 20} Td (${line}) Tj ET`)
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return `data:application/pdf;base64,${btoa(body)}`;
}

export class MockIntakeEngine {
  private memory: MockIntakeState = emptyState();

  private load(): MockIntakeState {
    if (typeof window === 'undefined') return this.memory;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...emptyState(), ...(JSON.parse(raw) as MockIntakeState) } : emptyState();
    } catch {
      return emptyState();
    }
  }

  private save(state: MockIntakeState) {
    this.memory = state;
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  /** A teljes demó állapot (tesztekhez). */
  getState(): MockIntakeState {
    return this.load();
  }

  reset() {
    this.save(emptyState());
  }

  private find(state: MockIntakeState, sessionId: string): MockIntakeSession {
    const session = state.sessions.find((s) => s.id === sessionId);
    if (!session) throw appError('INTAKE.NOT_FOUND');
    return session;
  }

  private bySessionToken(state: MockIntakeState, token: string | null): MockIntakeSession {
    const session = token ? state.sessions.find((s) => s.guestToken === token) : undefined;
    if (
      !session ||
      !session.guestTokenExpiresAt ||
      new Date(session.guestTokenExpiresAt).getTime() <= Date.now()
    ) {
      throw appError('INTAKE.GUEST_TOKEN_INVALID');
    }
    return session;
  }

  private transition(session: MockIntakeSession, event: IntakeEvent) {
    const next = nextIntakeStatus(session.status, event);
    if (!next) throw appError('INTAKE.INVALID_TRANSITION');
    session.status = next;
    session.updatedAt = new Date().toISOString();
  }

  private audit(state: MockIntakeState, action: string, entityId: string, user?: AuthUserDto | null) {
    state.auditLog.unshift({
      action,
      entityId,
      userId: user?.id ?? null,
      at: new Date().toISOString(),
    });
  }

  private clearGuestToken(session: MockIntakeSession) {
    session.guestToken = null;
    session.guestTokenExpiresAt = null;
  }

  private issueGuestToken(session: MockIntakeSession) {
    session.guestToken = randomId('mock-intake-token');
    session.guestTokenExpiresAt = new Date(
      Date.now() + INTAKE_GUEST_TOKEN_TTL_MINUTES * MINUTE_MS,
    ).toISOString();
    return { token: session.guestToken, expiresAt: session.guestTokenExpiresAt };
  }

  // -------------------------------------------------------------------------------------------
  // Munkatársi végpontok
  // -------------------------------------------------------------------------------------------

  listPackages(): IntakePackageDto[] {
    return BUILT_IN_INTAKE_PACKAGES;
  }

  listForms(): IntakeFormDefinitionDto[] {
    return BUILT_IN_INTAKE_FORMS;
  }

  findDuplicates(profile: IntakeProfileDraft, excludeGuestId?: string | null): IntakeDuplicateCandidateDto[] {
    return findIntakeDuplicates(profile, mockStudioEngine.getGuests(), excludeGuestId);
  }

  createSession(dto: CreateIntakeSessionRequestDto, user: AuthUserDto | null): IntakeSessionDetailDto {
    const packageKeys = [...new Set(dto.packageKeys)];
    if (packageKeys.length === 0) throw appError('INTAKE.PACKAGE_REQUIRED');
    if (packageKeys.some((key) => !BUILT_IN_INTAKE_PACKAGES.some((p) => p.key === key))) {
      throw appError('INTAKE.PACKAGE_UNKNOWN');
    }
    if (!dto.guestId && !dto.newGuest) throw appError('INTAKE.GUEST_REQUIRED');
    const guest = dto.guestId ? mockStudioEngine.getGuestById(dto.guestId) : null;
    const profile: IntakeProfileDraft = guest
      ? {
          lastName: guest.lastName,
          firstName: guest.firstName,
          birthDate: guest.birthDate?.slice(0, 10) ?? null,
          phone: guest.phone,
          email: guest.email,
          gender: guest.gender,
        }
      : { ...dto.newGuest };

    if (!guest && !dto.acknowledgeDuplicates) {
      const duplicates = this.findDuplicates(profile);
      if (duplicates.length > 0) {
        throw appError('INTAKE.DUPLICATE_SUSPECTED', { details: { duplicates } });
      }
    }

    const state = this.load();
    const required = requiredIntakeForms(BUILT_IN_INTAKE_FORMS, BUILT_IN_INTAKE_PACKAGES, packageKeys);
    const signed = guest
      ? state.snapshots.filter((s) => s.guestId === guest.id).map((s) => s.formKey)
      : [];
    const forms = missingIntakeForms(required, signed);
    if (!hasSignableIntakeForms(forms)) throw appError('INTAKE.NOTHING_MISSING');

    const profileForm = forms.find((f) => f.kind === 'PROFILE');
    const now = new Date().toISOString();
    const session: MockIntakeSession = {
      id: randomId('intake'),
      status: IntakeStatus.PREPARED,
      source: dto.source,
      guestId: guest?.id ?? null,
      linkGuestId: null,
      packageKeys,
      formKeys: forms.map((f) => f.key),
      profile,
      answers: profileForm ? { [profileForm.key]: answersFromProfile(profileForm, profile) } : {},
      health: {},
      consentGivenAt: null,
      measurements: {},
      profilePhotoDataUrl: null,
      signatureDataUrl: null,
      signedAt: null,
      guestToken: null,
      guestTokenExpiresAt: null,
      exitCode: null,
      exitAttempts: 0,
      handoverUser: null,
      assignedDeviceId: null,
      createdByName: user?.name ?? 'Recepció',
      approvedByName: null,
      approvedAt: null,
      completedAt: null,
      failureReason: null,
      createdAt: now,
      updatedAt: now,
    };
    state.sessions.unshift(session);
    this.audit(state, 'INTAKE_CREATED', session.id, user);
    this.save(state);
    return this.toDetail(state, session);
  }

  listSessions(): IntakeSessionSummaryDto[] {
    const recent = Date.now() - 30 * 24 * 60 * MINUTE_MS;
    const state = this.load();
    return state.sessions
      .filter((s) => isIntakeOpen(s.status) || new Date(s.updatedAt).getTime() >= recent)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((s) => this.toSummary(s));
  }

  getDetail(sessionId: string): IntakeSessionDetailDto {
    const state = this.load();
    return this.toDetail(state, this.find(state, sessionId));
  }

  getHealth(sessionId: string, user: AuthUserDto | null): IntakeHealthDto {
    const state = this.load();
    const session = this.find(state, sessionId);
    this.audit(state, 'HEALTH_DATA_READ', sessionId, user);
    this.save(state);
    return {
      sessionId,
      answers: session.health,
      warnings: formsFor(session.formKeys)
        .filter((f) => isHealthForm(f.kind))
        .flatMap((f) => intakeWarnings(f, session.health[f.key] ?? {})),
      consentGivenAt: session.consentGivenAt,
    };
  }

  updateSession(
    sessionId: string,
    dto: UpdateIntakeSessionRequestDto,
    user: AuthUserDto | null,
  ): IntakeSessionDetailDto {
    const state = this.load();
    const session = this.find(state, sessionId);
    if (!isIntakeOpen(session.status)) throw appError('INTAKE.INVALID_TRANSITION');
    if (dto.profile) session.profile = { ...session.profile, ...dto.profile };
    if (dto.measurements) session.measurements = sanitizeIntakeMeasurements(dto.measurements);
    if (dto.linkGuestId !== undefined) {
      if (session.guestId) throw appError('COMMON.BAD_REQUEST');
      if (dto.linkGuestId) mockStudioEngine.getGuestById(dto.linkGuestId);
      session.linkGuestId = dto.linkGuestId;
    }
    session.updatedAt = new Date().toISOString();
    this.audit(state, 'INTAKE_REVIEW_EDITED', sessionId, user);
    this.save(state);
    return this.toDetail(state, session);
  }

  startGuestMode(sessionId: string, user: AuthUserDto | null): IntakeGuestTokenDto {
    const state = this.load();
    const session = this.find(state, sessionId);
    if (!isIntakeEditableByGuest(session.status)) throw appError('INTAKE.INVALID_TRANSITION');
    const { token, expiresAt } = this.issueGuestToken(session);
    session.exitCode = String(Math.floor(100000 + Math.random() * 900000));
    session.exitAttempts = 0;
    session.handoverUser = user;
    session.assignedDeviceId = null;
    this.audit(state, 'INTAKE_GUEST_MODE_STARTED', sessionId, user);
    this.save(state);
    return { sessionId, guestToken: token, expiresAt, exitCode: session.exitCode };
  }

  sendToDevice(sessionId: string, deviceId: string, user: AuthUserDto | null): IntakeSendToDeviceResponseDto {
    const state = this.load();
    const session = this.find(state, sessionId);
    if (!isIntakeEditableByGuest(session.status)) throw appError('INTAKE.INVALID_TRANSITION');
    const device = mockStudioEngine.getDisplayDevices().find((d) => d.id === deviceId);
    if (!device) throw appError('AUTH.DEVICE_NOT_FOUND');
    if (device.kind !== 'TABLET' || device.status !== 'PAIRED' || !device.isActive) {
      throw appError('INTAKE.DEVICE_NOT_TABLET');
    }
    // Egy tableten egyszerre egy kitöltés.
    for (const other of state.sessions) {
      if (other.assignedDeviceId === deviceId && other.id !== sessionId) {
        other.assignedDeviceId = null;
        this.clearGuestToken(other);
      }
    }
    session.assignedDeviceId = deviceId;
    this.clearGuestToken(session);
    session.exitCode = String(Math.floor(100000 + Math.random() * 900000));
    session.exitAttempts = 0;
    session.handoverUser = null;
    this.audit(state, 'INTAKE_SENT_TO_DEVICE', sessionId, user);
    this.save(state);
    return { sessionId, deviceId, deviceName: device.name, exitCode: session.exitCode };
  }

  releaseGuestMode(sessionId: string, user: AuthUserDto | null): IntakeSessionDetailDto {
    const state = this.load();
    const session = this.find(state, sessionId);
    this.clearGuestToken(session);
    session.assignedDeviceId = null;
    this.audit(state, 'INTAKE_GUEST_MODE_RELEASED', sessionId, user);
    this.save(state);
    return this.toDetail(state, session);
  }

  returnToGuest(sessionId: string, user: AuthUserDto | null): IntakeSessionDetailDto {
    const state = this.load();
    const session = this.find(state, sessionId);
    this.transition(session, 'RETURNED_TO_GUEST');
    session.signatureDataUrl = null;
    session.signedAt = null;
    this.audit(state, 'INTAKE_RETURNED_TO_GUEST', sessionId, user);
    this.save(state);
    return this.toDetail(state, session);
  }

  cancel(sessionId: string, user: AuthUserDto | null): IntakeSessionDetailDto {
    const state = this.load();
    const session = this.find(state, sessionId);
    this.transition(session, 'CANCELLED');
    this.clearGuestToken(session);
    session.assignedDeviceId = null;
    this.audit(state, 'INTAKE_CANCELLED', sessionId, user);
    this.save(state);
    return this.toDetail(state, session);
  }

  /** Jóváhagyás: profil szinkron, pillanatképek, mérés, profilkép; a demó „PDF” azonnal kész. */
  approve(sessionId: string, user: AuthUserDto | null): IntakeSessionDetailDto {
    const state = this.load();
    const session = this.find(state, sessionId);
    if (nextIntakeStatus(session.status, 'APPROVED') === null) {
      throw appError('INTAKE.INVALID_TRANSITION');
    }
    const profile = session.profile;
    if (!profile.lastName?.trim() || !profile.firstName?.trim()) {
      throw appError('INTAKE.PROFILE_INCOMPLETE');
    }
    if (!session.signatureDataUrl || !session.signedAt) throw appError('INTAKE.SIGNATURE_REQUIRED');

    const fields = {
      lastName: profile.lastName.trim(),
      firstName: profile.firstName.trim(),
      ...(profile.email ? { email: profile.email } : {}),
      ...(profile.phone ? { phone: profile.phone } : {}),
      ...(profile.birthDate ? { birthDate: profile.birthDate } : {}),
      ...(profile.gender ? { gender: profile.gender } : {}),
    };
    const targetId = session.guestId ?? session.linkGuestId;
    const guest = targetId
      ? mockStudioEngine.updateGuest(targetId, fields)
      : mockStudioEngine.createGuest({ ...fields, gender: profile.gender ?? Gender.UNSPECIFIED });

    const now = new Date().toISOString();
    for (const form of formsFor(session.formKeys).filter((f) => f.requiresSignature)) {
      state.snapshots.unshift({
        id: randomId('intake-doc'),
        sessionId,
        guestId: guest.id,
        formKey: form.key,
        formVersion: form.version,
        title: form.title,
        bodyText: form.bodyText,
        answers: (isHealthForm(form.kind) ? session.health : session.answers)[form.key] ?? {},
        signatureDataUrl: session.signatureDataUrl,
        signedAt: session.signedAt,
        legalReviewPending: form.legalReviewPending,
        createdAt: now,
      });
    }
    if (hasIntakeMeasurements(session.measurements)) {
      mockStudioEngine.addMeasurement(guest.id, { ...session.measurements, intakeSessionId: sessionId }, user);
    }
    if (session.profilePhotoDataUrl) {
      mockStudioEngine.addPhoto(guest.id, {
        fileUrl: session.profilePhotoDataUrl,
        mimeType: session.profilePhotoDataUrl.slice(5, session.profilePhotoDataUrl.indexOf(';')),
        compressedSizeBytes: dataUrlBytes(session.profilePhotoDataUrl),
        visibilityRole: Role.RECEPTIONIST,
        purpose: 'PROFILE',
        note: PROFILE_PHOTO_NOTE,
      });
    }

    session.guestId = guest.id;
    session.approvedByName = user?.name ?? 'Recepció';
    session.approvedAt = now;
    this.clearGuestToken(session);
    this.transition(session, 'APPROVED');
    this.transition(session, 'FINALIZED');
    session.completedAt = now;
    this.audit(state, 'INTAKE_APPROVED', sessionId, user);
    this.save(state);
    return this.toDetail(state, session);
  }

  retry(sessionId: string, user: AuthUserDto | null): IntakeSessionDetailDto {
    const state = this.load();
    const session = this.find(state, sessionId);
    this.transition(session, 'RETRY');
    this.transition(session, 'FINALIZED');
    session.failureReason = null;
    session.completedAt = new Date().toISOString();
    this.audit(state, 'INTAKE_RETRY', sessionId, user);
    this.save(state);
    return this.toDetail(state, session);
  }

  listGuestDocuments(guestId: string): IntakeDocumentSnapshotDto[] {
    return this.load()
      .snapshots.filter((s) => s.guestId === guestId)
      .map((s) => this.toSnapshotDto(s));
  }

  documentLink(snapshotId: string, user: AuthUserDto | null): IntakeDocumentLinkDto {
    const state = this.load();
    const snapshot = state.snapshots.find((s) => s.id === snapshotId);
    if (!snapshot) throw appError('INTAKE.DOCUMENT_NOT_FOUND');
    this.audit(state, 'INTAKE_DOCUMENT_VIEWED', snapshotId, user);
    this.save(state);
    return {
      url: demoPdfDataUrl(snapshot),
      expiresAt: new Date(Date.now() + DOCUMENT_LINK_TTL_MS).toISOString(),
    };
  }

  sendDocumentEmail(snapshotId: string, user: AuthUserDto | null): { sent: true } {
    const state = this.load();
    const snapshot = state.snapshots.find((s) => s.id === snapshotId);
    if (!snapshot) throw appError('INTAKE.DOCUMENT_NOT_FOUND');
    const guest = mockStudioEngine.getGuestById(snapshot.guestId);
    if (!guest.email) throw appError('INTAKE.EMAIL_MISSING');
    mockStudioEngine.sendGuestEmailLog(guest.id, {
      subject: `${snapshot.title} – aláírt dokumentum`,
      messageType: 'INTAKE_DOCUMENT',
    });
    this.audit(state, 'INTAKE_DOCUMENT_EMAILED', snapshotId, user);
    this.save(state);
    return { sent: true };
  }

  // -------------------------------------------------------------------------------------------
  // Párosított tablet
  // -------------------------------------------------------------------------------------------

  claimForDevice(deviceToken: string | null): IntakeDeviceAssignmentDto | null {
    const deviceId = deviceToken?.startsWith('mock-device-token-')
      ? deviceToken.replace('mock-device-token-', '')
      : null;
    const device = mockStudioEngine.getDisplayDevices().find((d) => d.id === deviceId);
    if (!device || device.status !== 'PAIRED' || !device.isActive) {
      throw appError('AUTH.DEVICE_TOKEN_INVALID');
    }
    if (device.kind !== 'TABLET') throw appError('INTAKE.DEVICE_NOT_TABLET');
    const state = this.load();
    const session = state.sessions.find(
      (s) => s.assignedDeviceId === device.id && isIntakeEditableByGuest(s.status),
    );
    if (!session) return null;
    const { token, expiresAt } = this.issueGuestToken(session);
    this.save(state);
    return { sessionId: session.id, guestToken: token, expiresAt };
  }

  // -------------------------------------------------------------------------------------------
  // Vendégmód: csak a tokenhez tartozó kitöltés
  // -------------------------------------------------------------------------------------------

  getGuestView(token: string | null): IntakeGuestViewDto {
    const session = this.bySessionToken(this.load(), token);
    return this.toGuestView(session);
  }

  saveGuestAnswers(
    token: string | null,
    formKey: string,
    rawAnswers: IntakeAnswers,
  ): { warnings: IntakeWarning[] } {
    const state = this.load();
    const session = this.bySessionToken(state, token);
    if (!isIntakeEditableByGuest(session.status)) throw appError('INTAKE.INVALID_TRANSITION');
    const forms = formsFor(session.formKeys);
    const form = forms.find((f) => f.key === formKey);
    if (!form) throw appError('COMMON.NOT_FOUND');
    const known = new Set(form.questions.map((q) => q.id));
    const answers = pruneHiddenAnswers(
      form,
      Object.fromEntries(Object.entries(rawAnswers).filter(([id]) => known.has(id))),
    );
    if (isHealthForm(form.kind)) {
      const consentForm = forms.find((f) => f.kind === 'HEALTH_CONSENT');
      if (consentForm && missingRequiredAnswers(consentForm, session.answers[consentForm.key] ?? {}).length > 0) {
        throw appError('INTAKE.ANSWERS_INCOMPLETE', {
          message: 'Az egészségügyi kérdések előtt az egészségügyi adatkezelési hozzájárulás szükséges.',
        });
      }
      session.health = { ...session.health, [form.key]: answers };
    } else {
      session.answers = { ...session.answers, [form.key]: answers };
      if (form.kind === 'PROFILE') {
        session.profile = { ...session.profile, ...profileFromAnswers(form, answers) };
      }
      if (form.kind === 'HEALTH_CONSENT' && missingRequiredAnswers(form, answers).length === 0) {
        session.consentGivenAt = new Date().toISOString();
      }
    }
    this.transition(session, 'GUEST_STARTED');
    this.save(state);
    return { warnings: intakeWarnings(form, answers) };
  }

  saveGuestPhoto(token: string | null, dataUrl: string): { saved: true } {
    const state = this.load();
    const session = this.bySessionToken(state, token);
    if (!isIntakeEditableByGuest(session.status)) throw appError('INTAKE.INVALID_TRANSITION');
    if (dataUrlBytes(dataUrl) > INTAKE_PHOTO_MAX_BYTES) throw appError('INTAKE.PHOTO_TOO_LARGE');
    session.profilePhotoDataUrl = dataUrl;
    this.transition(session, 'GUEST_STARTED');
    this.save(state);
    return { saved: true };
  }

  submitGuest(token: string | null, signatureDataUrl: string): IntakeGuestViewDto {
    const state = this.load();
    const session = this.bySessionToken(state, token);
    if (!isIntakeEditableByGuest(session.status)) throw appError('INTAKE.INVALID_TRANSITION');
    if (!signatureDataUrl.startsWith('data:image/')) throw appError('INTAKE.SIGNATURE_REQUIRED');
    const answers = { ...session.answers, ...session.health };
    const missing = formsFor(session.formKeys)
      .map((f) => ({ formKey: f.key, questionIds: missingRequiredAnswers(f, answers[f.key] ?? {}) }))
      .filter((m) => m.questionIds.length > 0);
    if (missing.length > 0) throw appError('INTAKE.ANSWERS_INCOMPLETE', { details: { missing } });
    if (session.status === IntakeStatus.PREPARED) this.transition(session, 'GUEST_STARTED');
    this.transition(session, 'GUEST_SUBMITTED');
    session.signatureDataUrl = signatureDataUrl;
    session.signedAt = new Date().toISOString();
    this.save(state);
    return this.toGuestView(session);
  }

  exitGuestMode(token: string | null, exitCode: string): IntakeGuestExitResponseDto {
    const state = this.load();
    const session = this.bySessionToken(state, token);
    if (session.exitAttempts >= INTAKE_EXIT_MAX_ATTEMPTS) throw appError('INTAKE.EXIT_LOCKED');
    if (!session.exitCode || session.exitCode !== exitCode.trim()) {
      session.exitAttempts += 1;
      this.save(state);
      throw appError('INTAKE.EXIT_CODE_INVALID');
    }
    this.clearGuestToken(session);
    session.assignedDeviceId = null;
    session.exitCode = null;
    const staff = session.handoverUser;
    this.save(state);
    return staff
      ? { released: true, staff: { accessToken: 'local-session-token', user: staff } }
      : { released: true };
  }

  // -------------------------------------------------------------------------------------------
  // Leképezés
  // -------------------------------------------------------------------------------------------

  private toSummary(session: MockIntakeSession): IntakeSessionSummaryDto {
    const device = session.assignedDeviceId
      ? mockStudioEngine.getDisplayDevices().find((d) => d.id === session.assignedDeviceId)
      : undefined;
    const name = `${session.profile.lastName ?? ''} ${session.profile.firstName ?? ''}`.trim();
    return {
      id: session.id,
      status: session.status,
      source: session.source,
      guestId: session.guestId,
      guestName: name || 'Új vendég',
      packageKeys: session.packageKeys,
      packageLabels: packageLabels(session.packageKeys),
      assignedDeviceId: session.assignedDeviceId,
      assignedDeviceName: device?.name ?? null,
      createdByName: session.createdByName,
      failureReason: session.failureReason,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  private toDetail(state: MockIntakeState, session: MockIntakeSession): IntakeSessionDetailDto {
    const forms = formsFor(session.formKeys);
    return {
      ...this.toSummary(session),
      forms,
      profile: session.profile,
      answers: session.answers,
      measurements: session.measurements,
      profilePhotoDataUrl: session.profilePhotoDataUrl,
      signatureDataUrl: session.signatureDataUrl,
      signedAt: session.signedAt,
      duplicates: session.guestId ? [] : this.findDuplicates(session.profile),
      linkGuestId: session.linkGuestId,
      approvedByName: session.approvedByName,
      approvedAt: session.approvedAt,
      completedAt: session.completedAt,
      snapshots: state.snapshots
        .filter((s) => s.sessionId === session.id)
        .map((s) => this.toSnapshotDto(s)),
    };
  }

  private toGuestView(session: MockIntakeSession): IntakeGuestViewDto {
    return {
      sessionId: session.id,
      status: session.status,
      packageLabels: packageLabels(session.packageKeys),
      forms: formsFor(session.formKeys),
      answers: { ...session.answers, ...session.health },
      hasProfilePhoto: Boolean(session.profilePhotoDataUrl),
      expiresAt: session.guestTokenExpiresAt ?? new Date().toISOString(),
    };
  }

  private toSnapshotDto(snapshot: MockIntakeSnapshot): IntakeDocumentSnapshotDto {
    return {
      id: snapshot.id,
      sessionId: snapshot.sessionId,
      guestId: snapshot.guestId,
      formKey: snapshot.formKey,
      formVersion: snapshot.formVersion,
      title: snapshot.title,
      signedAt: snapshot.signedAt,
      legalReviewPending: snapshot.legalReviewPending,
      pdfAvailable: true,
      pdfSizeBytes: null,
      createdAt: snapshot.createdAt,
    };
  }
}

export const mockIntakeEngine = new MockIntakeEngine();
