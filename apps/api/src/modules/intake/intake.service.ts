import { Inject, Injectable, Logger, Optional, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DisplayDevice, IntakeDocumentSnapshot, IntakeSession, Prisma } from '@prisma/client';
import {
  answersFromProfile,
  appError,
  AuthUserDto,
  CreateIntakeSessionRequestDto,
  findIntakeDuplicates,
  hasIntakeMeasurements,
  hasSignableIntakeForms,
  INTAKE_EXIT_MAX_ATTEMPTS,
  INTAKE_GUEST_TOKEN_TTL_MINUTES,
  INTAKE_PHOTO_MAX_BYTES,
  INTAKE_SIGNATURE_MAX_BYTES,
  IntakeAnswers,
  IntakeAnswerSet,
  IntakeDeviceAssignmentDto,
  IntakeDocumentLinkDto,
  IntakeDocumentSnapshotDto,
  IntakeDuplicateCandidateDto,
  IntakeEvent,
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
  IntakeStatus,
  IntakeWarning,
  intakeWarnings,
  isHealthForm,
  isIntakeEditableByGuest,
  missingIntakeForms,
  missingRequiredAnswers,
  nextIntakeStatus,
  profileFromAnswers,
  pruneHiddenAnswers,
  requiredIntakeForms,
  Role,
  sanitizeIntakeMeasurements,
  SOCKET_EVENTS,
  toAppError,
  UpdateIntakeSessionRequestDto,
} from '@reform/shared';
import { randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { renderIntakeDocumentEmail } from '../mail/templates/intake-document';
import { MonitorGateway } from '../monitor/monitor.gateway';
import { StorageService } from '../storage/storage.service';
import { IntakeDefinitionsService, readFormRefs } from './intake-definitions.service';
import { IntakePdfService } from './intake-pdf.service';
import { buildSnapshots } from './intake-snapshot';
import { createExitCode, createGuestToken, exitCodeMatches, hashExitCode } from './intake-tokens';

const MINUTE_MS = 60 * 1000;
const MAX_ANSWER_LENGTH = 2000;
const MAX_ANSWERS_PER_FORM = 60;
const PROFILE_PHOTO_NOTE = 'Belső azonosító profilkép (vendégfelvétel)';

const OPEN_STATUSES: IntakeStatus[] = [
  IntakeStatus.PREPARED,
  IntakeStatus.GUEST_FILLING,
  IntakeStatus.AWAITING_REVIEW,
];
const GUEST_EDITABLE: IntakeStatus[] = [IntakeStatus.PREPARED, IntakeStatus.GUEST_FILLING];

const sessionInclude = {
  guest: true,
  createdBy: true,
  approvedBy: true,
  assignedDevice: true,
  snapshots: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.IntakeSessionInclude;

type SessionWithRelations = Prisma.IntakeSessionGetPayload<{ include: typeof sessionInclude }>;

const asRecord = (value: Prisma.JsonValue | null | undefined): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Űrlapkulcs → válaszok; csak szöveg és szövegtömb marad meg. */
function readAnswerSet(value: Prisma.JsonValue | null | undefined): IntakeAnswerSet {
  const result: IntakeAnswerSet = {};
  for (const [formKey, answers] of Object.entries(asRecord(value))) {
    result[formKey] = sanitizeAnswers(answers);
  }
  return result;
}

function sanitizeAnswers(value: unknown): IntakeAnswers {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const result: IntakeAnswers = {};
  for (const [id, raw] of Object.entries(source as Record<string, unknown>).slice(
    0,
    MAX_ANSWERS_PER_FORM,
  )) {
    if (typeof raw === 'string') {
      result[id] = raw.slice(0, MAX_ANSWER_LENGTH);
    } else if (Array.isArray(raw)) {
      result[id] = raw
        .filter((v): v is string => typeof v === 'string')
        .slice(0, 20)
        .map((v) => v.slice(0, 200));
    }
  }
  return result;
}

const toJson = (value: unknown) => value as Prisma.InputJsonValue;

/** A base64 data URL dekódolt mérete (bájt). */
const dataUrlBytes = (dataUrl: string) =>
  Math.floor(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4);

const trimOrNull = (value: string | null | undefined) => {
  const text = value?.trim();
  return text ? text : null;
};

const guestDisplayName = (session: SessionWithRelations): string => {
  if (session.guest) return `${session.guest.lastName} ${session.guest.firstName}`;
  const profile = asRecord(session.profileDraft) as IntakeProfileDraft;
  const name = `${profile.lastName ?? ''} ${profile.firstName ?? ''}`.trim();
  return name || 'Új vendég';
};

/**
 * Tabletes vendégfelvétel (TICKET-56). Az állapotváltásokat a közös `nextIntakeStatus` dönti
 * el; az írások feltételesek (`updateMany` az elvárt állapotra), így párhuzamos kérés sem léptet
 * kétszer. A vendégmód csak a saját munkamenetét látja (`IntakeGuestGuard`), az egészségügyi
 * válaszok külön táblában vannak, és minden olvasásuk auditnaplóba kerül.
 */
@Injectable()
export class IntakeService {
  private readonly logger = new Logger(IntakeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly definitions: IntakeDefinitionsService,
    private readonly pdf: IntakePdfService,
    private readonly storage: StorageService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    @Optional()
    @Inject(forwardRef(() => MonitorGateway))
    private readonly gateway?: MonitorGateway,
  ) {}

  private get secret(): string {
    return this.config.get<string>('JWT_SECRET') ?? 'reform-studio-dev-secret-change-in-prod';
  }

  // -------------------------------------------------------------------------------------------
  // Munkatársi végpontok
  // -------------------------------------------------------------------------------------------

  listPackages(studioId: string): Promise<IntakePackageDto[]> {
    return this.definitions.packages(studioId);
  }

  listForms(): Promise<IntakeFormDefinitionDto[]> {
    return this.definitions.activeForms();
  }

  async findDuplicates(
    profile: IntakeProfileDraft,
    studioId: string,
    excludeGuestId?: string | null,
  ): Promise<IntakeDuplicateCandidateDto[]> {
    const hasInput = [profile.lastName, profile.phone, profile.email].some((v) => v?.trim());
    if (!hasInput) return [];
    const guests = await this.prisma.guest.findMany({
      where: { studioId, isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        barcode: true,
        birthDate: true,
        phone: true,
        email: true,
      },
    });
    return findIntakeDuplicates(
      profile,
      guests.map((g) => ({ ...g, birthDate: g.birthDate?.toISOString().slice(0, 10) ?? null })),
      excludeGuestId,
    );
  }

  async createSession(
    dto: CreateIntakeSessionRequestDto,
    user: AuthUserDto,
  ): Promise<IntakeSessionDetailDto> {
    const packages = await this.definitions.packages(user.studioId);
    const packageKeys = [...new Set(dto.packageKeys)];
    if (packageKeys.length === 0) throw appError('INTAKE.PACKAGE_REQUIRED');
    if (packageKeys.some((key) => !packages.some((p) => p.key === key))) {
      throw appError('INTAKE.PACKAGE_UNKNOWN');
    }
    if (!dto.guestId && !dto.newGuest) throw appError('INTAKE.GUEST_REQUIRED');

    const guest = dto.guestId
      ? await this.prisma.guest.findFirst({ where: { id: dto.guestId, studioId: user.studioId } })
      : null;
    if (dto.guestId && !guest) throw appError('GUEST.NOT_FOUND');

    const profile: IntakeProfileDraft = guest
      ? {
          lastName: guest.lastName,
          firstName: guest.firstName,
          birthDate: guest.birthDate?.toISOString().slice(0, 10) ?? null,
          phone: guest.phone,
          email: guest.email,
          gender: guest.gender as IntakeProfileDraft['gender'],
        }
      : { ...dto.newGuest };

    if (!guest && !dto.acknowledgeDuplicates) {
      const duplicates = await this.findDuplicates(profile, user.studioId);
      if (duplicates.length > 0) {
        throw appError('INTAKE.DUPLICATE_SUSPECTED', { details: { duplicates } });
      }
    }

    const required = requiredIntakeForms(await this.definitions.activeForms(), packages, packageKeys);
    const signed = guest
      ? await this.prisma.intakeDocumentSnapshot.findMany({
          where: { guestId: guest.id },
          select: { formKey: true },
          distinct: ['formKey'],
        })
      : [];
    const forms = missingIntakeForms(
      required,
      signed.map((s) => s.formKey),
    );
    if (!hasSignableIntakeForms(forms)) throw appError('INTAKE.NOTHING_MISSING');

    const profileForm = forms.find((f) => f.kind === 'PROFILE');
    const answers: IntakeAnswerSet = profileForm
      ? { [profileForm.key]: answersFromProfile(profileForm, profile) }
      : {};

    const created = await this.prisma.$transaction(async (tx) => {
      const session = await tx.intakeSession.create({
        data: {
          studioId: user.studioId,
          guestId: guest?.id ?? null,
          status: IntakeStatus.PREPARED,
          source: dto.source,
          packageKeys,
          formRefs: toJson(forms.map((f) => ({ key: f.key, version: f.version }))),
          profileDraft: toJson(profile),
          answers: toJson(answers),
          createdById: user.id,
        },
      });
      await tx.auditLog.create({
        data: {
          studioId: user.studioId,
          userId: user.id,
          action: 'INTAKE_CREATED',
          entityType: 'IntakeSession',
          entityId: session.id,
          details: `Vendégfelvétel előkészítve (${packageKeys.join(', ')}; ${forms.length} űrlap)`,
        },
      });
      return session;
    });
    this.emitUpdated(created);
    return this.getDetail(created.id, user.studioId);
  }

  async listSessions(
    studioId: string,
    filter: { status?: IntakeStatus; guestId?: string } = {},
  ): Promise<IntakeSessionSummaryDto[]> {
    const recent = new Date(Date.now() - 30 * 24 * 60 * MINUTE_MS);
    const sessions = await this.prisma.intakeSession.findMany({
      where: {
        studioId,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.guestId ? { guestId: filter.guestId } : {}),
        ...(!filter.status && !filter.guestId
          ? { OR: [{ status: { in: OPEN_STATUSES } }, { updatedAt: { gte: recent } }] }
          : {}),
      },
      include: sessionInclude,
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    const labels = await this.packageLabels(studioId);
    return sessions.map((s) => this.toSummary(s, labels));
  }

  async getDetail(sessionId: string, studioId: string): Promise<IntakeSessionDetailDto> {
    const session = await this.loadSession(sessionId, studioId);
    const forms = await this.definitions.formsByRefs(readFormRefs(session.formRefs));
    const profile = asRecord(session.profileDraft) as IntakeProfileDraft;
    const answers = readAnswerSet(session.answers);
    const duplicates = session.guestId
      ? []
      : await this.findDuplicates(profile, studioId);
    return {
      ...this.toSummary(session, await this.packageLabels(studioId)),
      forms,
      profile,
      // Az egészségügyi űrlapok válaszai nem itt, hanem az auditált `health` végponton.
      answers: Object.fromEntries(
        Object.entries(answers).filter(([key]) => {
          const form = forms.find((f) => f.key === key);
          return form ? !isHealthForm(form.kind) : false;
        }),
      ),
      measurements: sanitizeIntakeMeasurements(session.measurementDraft),
      profilePhotoDataUrl: session.profilePhotoDataUrl,
      signatureDataUrl: session.signatureDataUrl,
      signedAt: session.signedAt?.toISOString() ?? null,
      duplicates,
      linkGuestId: session.linkGuestId,
      approvedByName: session.approvedBy?.name ?? null,
      approvedAt: session.approvedAt?.toISOString() ?? null,
      completedAt: session.completedAt?.toISOString() ?? null,
      snapshots: session.snapshots.map((s) => this.toSnapshotDto(s)),
    };
  }

  /** Egészségügyi válaszok: csak munkatársnak, minden olvasás auditnaplóba kerül. */
  async getHealth(sessionId: string, user: AuthUserDto): Promise<IntakeHealthDto> {
    const session = await this.loadSession(sessionId, user.studioId);
    const forms = await this.definitions.formsByRefs(readFormRefs(session.formRefs));
    const record = await this.prisma.intakeHealthRecord.findUnique({ where: { sessionId } });
    const answers = readAnswerSet(record?.answers);
    await this.prisma.auditLog.create({
      data: {
        studioId: user.studioId,
        userId: user.id,
        action: 'HEALTH_DATA_READ',
        entityType: 'IntakeHealthRecord',
        entityId: record?.id ?? sessionId,
        details: `Egészségügyi válaszok megtekintve (vendégfelvétel: ${sessionId})`,
      },
    });
    return {
      sessionId,
      answers,
      warnings: forms
        .filter((f) => isHealthForm(f.kind))
        .flatMap((f) => intakeWarnings(f, answers[f.key] ?? {})),
      consentGivenAt: record?.consentGivenAt?.toISOString() ?? null,
    };
  }

  async updateSession(
    sessionId: string,
    dto: UpdateIntakeSessionRequestDto,
    user: AuthUserDto,
  ): Promise<IntakeSessionDetailDto> {
    const session = await this.loadSession(sessionId, user.studioId);
    if (!OPEN_STATUSES.includes(session.status as IntakeStatus)) {
      throw appError('INTAKE.INVALID_TRANSITION');
    }
    const data: Prisma.IntakeSessionUpdateInput = {};
    if (dto.profile) {
      data.profileDraft = toJson({ ...asRecord(session.profileDraft), ...dto.profile });
    }
    if (dto.measurements) {
      data.measurementDraft = toJson(sanitizeIntakeMeasurements(dto.measurements));
    }
    if (dto.linkGuestId !== undefined) {
      if (session.guestId) throw appError('COMMON.BAD_REQUEST');
      if (dto.linkGuestId) {
        const target = await this.prisma.guest.findFirst({
          where: { id: dto.linkGuestId, studioId: user.studioId, isActive: true },
        });
        if (!target) throw appError('GUEST.NOT_FOUND');
      }
      data.linkGuestId = dto.linkGuestId;
    }
    await this.prisma.$transaction([
      this.prisma.intakeSession.update({ where: { id: sessionId }, data }),
      this.prisma.auditLog.create({
        data: {
          studioId: user.studioId,
          userId: user.id,
          action: 'INTAKE_REVIEW_EDITED',
          entityType: 'IntakeSession',
          entityId: sessionId,
          details: `Módosítva: ${Object.keys(data).join(', ') || 'nincs'}`,
        },
      }),
    ]);
    return this.getDetail(sessionId, user.studioId);
  }

  /** Vendégmód ezen az eszközön: a munkatárs átadja a tabletet (vagy a PC-t) a vendégnek. */
  async startGuestMode(sessionId: string, user: AuthUserDto): Promise<IntakeGuestTokenDto> {
    const session = await this.loadSession(sessionId, user.studioId);
    if (!isIntakeEditableByGuest(session.status as IntakeStatus)) {
      throw appError('INTAKE.INVALID_TRANSITION');
    }
    const previousDeviceId = session.assignedDeviceId;
    const exitCode = createExitCode();
    const { token, hash } = createGuestToken();
    const expiresAt = new Date(Date.now() + INTAKE_GUEST_TOKEN_TTL_MINUTES * MINUTE_MS);
    await this.prisma.intakeSession.update({
      where: { id: sessionId },
      data: {
        guestTokenHash: hash,
        guestTokenExpiresAt: expiresAt,
        exitCodeHash: hashExitCode(this.secret, sessionId, exitCode),
        exitAttempts: 0,
        handoverUserId: user.id,
        assignedDeviceId: null,
      },
    });
    if (previousDeviceId) this.emitReleased(sessionId, previousDeviceId);
    await this.audit(user, 'INTAKE_GUEST_MODE_STARTED', sessionId, 'Vendégmód indítva ezen az eszközön');
    return { sessionId, guestToken: token, expiresAt: expiresAt.toISOString(), exitCode };
  }

  /** PC → tablet: a párosított tablet valós időben megkapja (socket), és `claim`-mel átveszi. */
  async sendToDevice(
    sessionId: string,
    deviceId: string,
    user: AuthUserDto,
  ): Promise<IntakeSendToDeviceResponseDto> {
    const session = await this.loadSession(sessionId, user.studioId);
    if (!isIntakeEditableByGuest(session.status as IntakeStatus)) {
      throw appError('INTAKE.INVALID_TRANSITION');
    }
    const device = await this.prisma.displayDevice.findFirst({
      where: { id: deviceId, studioId: user.studioId },
    });
    if (!device) throw appError('AUTH.DEVICE_NOT_FOUND');
    if (device.kind !== 'TABLET' || !device.isActive || device.pairingCode !== null) {
      throw appError('INTAKE.DEVICE_NOT_TABLET');
    }
    // Egy tableten egyszerre egy kitöltés: a korábbi hozzárendelés megszűnik.
    const previous = await this.prisma.intakeSession.findMany({
      where: { assignedDeviceId: device.id, id: { not: sessionId } },
      select: { id: true },
    });
    const exitCode = createExitCode();
    await this.prisma.$transaction([
      this.prisma.intakeSession.updateMany({
        where: { assignedDeviceId: device.id, id: { not: sessionId } },
        data: { assignedDeviceId: null, guestTokenHash: null, guestTokenExpiresAt: null },
      }),
      this.prisma.intakeSession.update({
        where: { id: sessionId },
        data: {
          assignedDeviceId: device.id,
          guestTokenHash: null,
          guestTokenExpiresAt: null,
          exitCodeHash: hashExitCode(this.secret, sessionId, exitCode),
          exitAttempts: 0,
          handoverUserId: null,
        },
      }),
    ]);
    for (const p of previous) this.emitReleased(p.id, device.id);
    this.gateway?.emitToDevice(SOCKET_EVENTS.INTAKE_ASSIGNED, { sessionId, deviceId: device.id });
    await this.audit(user, 'INTAKE_SENT_TO_DEVICE', sessionId, `Tabletre küldve: ${device.name}`);
    return { sessionId, deviceId: device.id, deviceName: device.name, exitCode };
  }

  /** A recepció lezárja a vendégmódot (a tableten is): a vendégtoken érvénytelen lesz. */
  async releaseGuestMode(sessionId: string, user: AuthUserDto): Promise<IntakeSessionDetailDto> {
    const session = await this.loadSession(sessionId, user.studioId);
    await this.prisma.intakeSession.update({
      where: { id: sessionId },
      data: { guestTokenHash: null, guestTokenExpiresAt: null, assignedDeviceId: null },
    });
    if (session.assignedDeviceId) this.emitReleased(sessionId, session.assignedDeviceId);
    await this.audit(user, 'INTAKE_GUEST_MODE_RELEASED', sessionId, 'Vendégmód lezárva a recepcióról');
    return this.getDetail(sessionId, user.studioId);
  }

  async returnToGuest(sessionId: string, user: AuthUserDto): Promise<IntakeSessionDetailDto> {
    await this.transition(sessionId, user.studioId, 'RETURNED_TO_GUEST', {
      signatureDataUrl: null,
      signedAt: null,
    });
    await this.audit(user, 'INTAKE_RETURNED_TO_GUEST', sessionId, 'Javításra visszaküldve a vendégnek');
    return this.getDetail(sessionId, user.studioId);
  }

  async cancel(sessionId: string, user: AuthUserDto): Promise<IntakeSessionDetailDto> {
    const session = await this.loadSession(sessionId, user.studioId);
    await this.transition(sessionId, user.studioId, 'CANCELLED', {
      guestTokenHash: null,
      guestTokenExpiresAt: null,
      assignedDeviceId: null,
    });
    if (session.assignedDeviceId) this.emitReleased(sessionId, session.assignedDeviceId);
    await this.audit(user, 'INTAKE_CANCELLED', sessionId, 'Vendégfelvétel megszakítva');
    return this.getDetail(sessionId, user.studioId);
  }

  /**
   * Jóváhagyás: egyetlen `$transaction`-ben az állapot, a vendégprofil (új vagy meglévő), a
   * változatlan pillanatképek, a mérés, a profilkép, az egészségügyi rekord és a napló. Utána a
   * PDF-ek elkészítése és tárolása (lezárás); ennek hibája `FAILED` állapot, újrapróbálható.
   */
  async approve(sessionId: string, user: AuthUserDto): Promise<IntakeSessionDetailDto> {
    const session = await this.loadSession(sessionId, user.studioId);
    if (nextIntakeStatus(session.status as IntakeStatus, 'APPROVED') === null) {
      throw appError('INTAKE.INVALID_TRANSITION');
    }
    const profile = asRecord(session.profileDraft) as IntakeProfileDraft;
    if (!profile.lastName?.trim() || !profile.firstName?.trim()) {
      throw appError('INTAKE.PROFILE_INCOMPLETE');
    }
    if (!session.signatureDataUrl || !session.signedAt) throw appError('INTAKE.SIGNATURE_REQUIRED');
    const forms = await this.definitions.formsByRefs(readFormRefs(session.formRefs));
    const health = await this.prisma.intakeHealthRecord.findUnique({ where: { sessionId } });
    const snapshots = buildSnapshots(
      forms,
      readAnswerSet(session.answers),
      readAnswerSet(health?.answers),
      session.signatureDataUrl,
      session.signedAt,
    );
    const measurements = sanitizeIntakeMeasurements(session.measurementDraft);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.intakeSession.updateMany({
        where: { id: sessionId, status: IntakeStatus.AWAITING_REVIEW },
        data: {
          status: IntakeStatus.APPROVED,
          approvedById: user.id,
          approvedAt: now,
          guestTokenHash: null,
          guestTokenExpiresAt: null,
        },
      });
      if (count !== 1) throw appError('INTAKE.INVALID_TRANSITION');

      const guestId = await this.syncGuestProfile(
        tx,
        session.guestId ?? session.linkGuestId,
        profile,
        user.studioId,
      );
      await tx.intakeSession.update({ where: { id: sessionId }, data: { guestId } });
      await tx.intakeHealthRecord.updateMany({
        where: { sessionId },
        data: { guestId, approvedAt: now },
      });
      for (const snapshot of snapshots) {
        await tx.intakeDocumentSnapshot.create({
          data: { ...snapshot, answers: toJson(snapshot.answers), sessionId, guestId },
        });
      }
      if (hasIntakeMeasurements(measurements)) {
        await tx.measurement.create({
          data: { ...measurements, guestId, recordedById: user.id, intakeSessionId: sessionId },
        });
      }
      if (session.profilePhotoDataUrl) {
        await tx.guestPhoto.create({
          data: {
            guestId,
            fileUrl: session.profilePhotoDataUrl,
            mimeType: session.profilePhotoDataUrl.slice(5, session.profilePhotoDataUrl.indexOf(';')),
            compressedSizeBytes: dataUrlBytes(session.profilePhotoDataUrl),
            purpose: 'PROFILE',
            visibilityRole: Role.RECEPTIONIST,
            note: PROFILE_PHOTO_NOTE,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          studioId: user.studioId,
          userId: user.id,
          action: 'INTAKE_APPROVED',
          entityType: 'IntakeSession',
          entityId: sessionId,
          details: `Jóváhagyva, vendég: ${guestId}; ${snapshots.length} aláírt dokumentum`,
        },
      });
      if (health) {
        await tx.auditLog.create({
          data: {
            studioId: user.studioId,
            userId: user.id,
            action: 'HEALTH_DATA_APPROVED',
            entityType: 'IntakeHealthRecord',
            entityId: health.id,
            details: `Egészségügyi válaszok jóváhagyva (vendégfelvétel: ${sessionId})`,
          },
        });
      }
    });

    await this.finalize(sessionId);
    return this.getDetail(sessionId, user.studioId);
  }

  async retry(sessionId: string, user: AuthUserDto): Promise<IntakeSessionDetailDto> {
    await this.transition(sessionId, user.studioId, 'RETRY', { failureReason: null });
    await this.audit(user, 'INTAKE_RETRY', sessionId, 'Lezárás újrapróbálva');
    await this.finalize(sessionId);
    return this.getDetail(sessionId, user.studioId);
  }

  /** PDF-ek elkészítése és tárolása; siker → `COMPLETED`, hiba → `FAILED` (a hiba okával). */
  async finalize(sessionId: string): Promise<void> {
    const session = await this.prisma.intakeSession.findUnique({
      where: { id: sessionId },
      include: sessionInclude,
    });
    if (!session || session.status !== IntakeStatus.APPROVED || !session.guestId) return;
    const forms = await this.definitions.formsByRefs(readFormRefs(session.formRefs));
    const guestName = guestDisplayName(session);
    let outcome: IntakeEvent = 'FINALIZED';
    let failureReason: string | null = null;
    try {
      for (const snapshot of session.snapshots) {
        if (snapshot.pdfStorageKey) continue;
        const form = forms.find((f) => f.key === snapshot.formKey);
        const pdf = await this.pdf.render({
          title: snapshot.title,
          formKey: snapshot.formKey,
          formVersion: snapshot.formVersion,
          bodyText: snapshot.bodyText,
          questions: form?.questions ?? [],
          answers: sanitizeAnswers(snapshot.answers),
          signatureDataUrl: snapshot.signatureDataUrl,
          signedAt: snapshot.signedAt,
          legalReviewPending: snapshot.legalReviewPending,
          guestName,
          contentHash: snapshot.contentHash,
        });
        const key = `intake/${session.guestId}/${sessionId}/${snapshot.formKey}-v${snapshot.formVersion}.pdf`;
        await this.storage.upload(key, pdf, 'application/pdf');
        await this.prisma.intakeDocumentSnapshot.update({
          where: { id: snapshot.id },
          data: { pdfStorageKey: key, pdfSizeBytes: pdf.length, pdfCreatedAt: new Date() },
        });
      }
    } catch (err) {
      const error = toAppError(err);
      this.logger.error(`Vendégfelvétel lezárása sikertelen (${sessionId}): ${error.code}`);
      outcome = 'FINALIZE_FAILED';
      failureReason = error.message;
    }
    const status = nextIntakeStatus(IntakeStatus.APPROVED, outcome)!;
    await this.prisma.intakeSession.updateMany({
      where: { id: sessionId, status: IntakeStatus.APPROVED },
      data: {
        status,
        failureReason,
        ...(status === IntakeStatus.COMPLETED ? { completedAt: new Date() } : {}),
      },
    });
    this.emitUpdated({ id: sessionId, studioId: session.studioId, status });
  }

  // -------------------------------------------------------------------------------------------
  // Aláírt dokumentumok a vendégprofilon
  // -------------------------------------------------------------------------------------------

  async listGuestDocuments(guestId: string, studioId: string): Promise<IntakeDocumentSnapshotDto[]> {
    const rows = await this.prisma.intakeDocumentSnapshot.findMany({
      where: { guestId, guest: { studioId } },
      orderBy: [{ signedAt: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => this.toSnapshotDto(r));
  }

  async documentLink(snapshotId: string, user: AuthUserDto): Promise<IntakeDocumentLinkDto> {
    const snapshot = await this.loadSnapshot(snapshotId, user.studioId);
    if (!snapshot.pdfStorageKey) throw appError('INTAKE.PDF_NOT_READY');
    const link = await this.storage.createLink(snapshot.pdfStorageKey);
    await this.audit(
      user,
      'INTAKE_DOCUMENT_VIEWED',
      snapshot.id,
      `Aláírt dokumentum megnyitva: ${snapshot.title}`,
      'IntakeDocumentSnapshot',
    );
    return link;
  }

  /** A PDF elküldése a vendégnek csatolmányként; a levél a `MessageLog`-ba kerül. */
  async sendDocumentEmail(snapshotId: string, user: AuthUserDto): Promise<{ sent: true }> {
    const snapshot = await this.loadSnapshot(snapshotId, user.studioId);
    const guest = snapshot.guest;
    if (!guest.email) throw appError('INTAKE.EMAIL_MISSING');
    if (!snapshot.pdfStorageKey) throw appError('INTAKE.PDF_NOT_READY');
    const guestName = `${guest.lastName} ${guest.firstName}`;
    const message = renderIntakeDocumentEmail({
      guestName,
      documentTitle: snapshot.title,
      signedAt: snapshot.signedAt,
    });
    try {
      const pdf = await this.storage.download(snapshot.pdfStorageKey);
      await this.mail.send({ email: guest.email, name: guestName }, message, {
        attachments: [{ filename: `${snapshot.formKey}-v${snapshot.formVersion}.pdf`, content: pdf }],
      });
    } catch (err) {
      const error = toAppError(err);
      await this.prisma.messageLog.create({
        data: {
          guestId: guest.id,
          recipientEmail: guest.email,
          subject: message.subject,
          messageType: 'INTAKE_DOCUMENT',
          status: 'FAILED',
          errorDetails: error.message,
        },
      });
      throw error.code.startsWith('STORAGE.') ? error : appError('INTAKE.MAIL_FAILED', { cause: err });
    }
    await this.prisma.$transaction([
      this.prisma.messageLog.create({
        data: {
          guestId: guest.id,
          recipientEmail: guest.email,
          subject: message.subject,
          messageType: 'INTAKE_DOCUMENT',
          status: 'SENT',
          sentAt: new Date(),
        },
      }),
      this.prisma.auditLog.create({
        data: {
          studioId: user.studioId,
          userId: user.id,
          action: 'INTAKE_DOCUMENT_EMAILED',
          entityType: 'IntakeDocumentSnapshot',
          entityId: snapshot.id,
          details: `Aláírt dokumentum elküldve: ${snapshot.title}`,
        },
      }),
    ]);
    return { sent: true };
  }

  // -------------------------------------------------------------------------------------------
  // Párosított tablet
  // -------------------------------------------------------------------------------------------

  /** A tabletnek küldött, még kitölthető kitöltés átvétele: friss vendégtokent kap. */
  async claimForDevice(device: DisplayDevice): Promise<IntakeDeviceAssignmentDto | null> {
    const session = await this.prisma.intakeSession.findFirst({
      where: { assignedDeviceId: device.id, status: { in: GUEST_EDITABLE } },
      orderBy: { updatedAt: 'desc' },
    });
    if (!session) return null;
    const { token, hash } = createGuestToken();
    const expiresAt = new Date(Date.now() + INTAKE_GUEST_TOKEN_TTL_MINUTES * MINUTE_MS);
    await this.prisma.intakeSession.update({
      where: { id: session.id },
      data: { guestTokenHash: hash, guestTokenExpiresAt: expiresAt },
    });
    return { sessionId: session.id, guestToken: token, expiresAt: expiresAt.toISOString() };
  }

  // -------------------------------------------------------------------------------------------
  // Vendégmód (csak a saját munkamenet; a guard adja)
  // -------------------------------------------------------------------------------------------

  async getGuestView(session: IntakeSession): Promise<IntakeGuestViewDto> {
    const forms = await this.definitions.formsByRefs(readFormRefs(session.formRefs));
    const health = await this.prisma.intakeHealthRecord.findUnique({
      where: { sessionId: session.id },
    });
    return {
      sessionId: session.id,
      status: session.status as IntakeStatus,
      packageLabels: await this.packageLabelsFor(session),
      forms,
      answers: { ...readAnswerSet(session.answers), ...readAnswerSet(health?.answers) },
      hasProfilePhoto: Boolean(session.profilePhotoDataUrl),
      expiresAt: session.guestTokenExpiresAt!.toISOString(),
    };
  }

  async saveGuestAnswers(
    session: IntakeSession,
    formKey: string,
    rawAnswers: unknown,
  ): Promise<{ warnings: IntakeWarning[] }> {
    this.assertGuestEditable(session);
    const forms = await this.definitions.formsByRefs(readFormRefs(session.formRefs));
    const form = forms.find((f) => f.key === formKey);
    if (!form) throw appError('COMMON.NOT_FOUND');
    const known = new Set(form.questions.map((q) => q.id));
    const answers = pruneHiddenAnswers(
      form,
      Object.fromEntries(Object.entries(sanitizeAnswers(rawAnswers)).filter(([id]) => known.has(id))),
    );
    const general = readAnswerSet(session.answers);
    const now = new Date();
    const status = nextIntakeStatus(session.status as IntakeStatus, 'GUEST_STARTED')!;

    if (isHealthForm(form.kind)) {
      // Egészségügyi adat csak az erre adott hozzájárulás után kerülhet be.
      const consentForm = forms.find((f) => f.kind === 'HEALTH_CONSENT');
      if (consentForm && missingRequiredAnswers(consentForm, general[consentForm.key] ?? {}).length > 0) {
        throw appError('INTAKE.ANSWERS_INCOMPLETE', {
          message: 'Az egészségügyi kérdések előtt az egészségügyi adatkezelési hozzájárulás szükséges.',
        });
      }
      const existing = await this.prisma.intakeHealthRecord.findUnique({
        where: { sessionId: session.id },
      });
      const merged = { ...readAnswerSet(existing?.answers), [form.key]: answers };
      await this.prisma.$transaction([
        this.prisma.intakeHealthRecord.upsert({
          where: { sessionId: session.id },
          create: { sessionId: session.id, guestId: session.guestId, answers: toJson(merged) },
          update: { answers: toJson(merged) },
        }),
        this.prisma.intakeSession.updateMany({
          where: { id: session.id, status: { in: GUEST_EDITABLE } },
          data: { status },
        }),
      ]);
    } else {
      const data: Prisma.IntakeSessionUncheckedUpdateManyInput = {
        status,
        answers: toJson({ ...general, [form.key]: answers }),
      };
      if (form.kind === 'PROFILE') {
        data.profileDraft = toJson({
          ...asRecord(session.profileDraft),
          ...profileFromAnswers(form, answers),
        });
      }
      const { count } = await this.prisma.intakeSession.updateMany({
        where: { id: session.id, status: { in: GUEST_EDITABLE } },
        data,
      });
      if (count !== 1) throw appError('INTAKE.INVALID_TRANSITION');
      if (form.kind === 'HEALTH_CONSENT' && missingRequiredAnswers(form, answers).length === 0) {
        await this.prisma.intakeHealthRecord.upsert({
          where: { sessionId: session.id },
          create: { sessionId: session.id, guestId: session.guestId, consentGivenAt: now },
          update: { consentGivenAt: now },
        });
      }
    }
    if (status !== session.status) this.emitUpdated({ ...session, status });
    return { warnings: intakeWarnings(form, answers) };
  }

  async saveGuestPhoto(session: IntakeSession, dataUrl: string): Promise<{ saved: true }> {
    this.assertGuestEditable(session);
    if (dataUrlBytes(dataUrl) > INTAKE_PHOTO_MAX_BYTES) throw appError('INTAKE.PHOTO_TOO_LARGE');
    const { count } = await this.prisma.intakeSession.updateMany({
      where: { id: session.id, status: { in: GUEST_EDITABLE } },
      data: {
        profilePhotoDataUrl: dataUrl,
        status: nextIntakeStatus(session.status as IntakeStatus, 'GUEST_STARTED')!,
      },
    });
    if (count !== 1) throw appError('INTAKE.INVALID_TRANSITION');
    return { saved: true };
  }

  /** Beküldés aláírással: minden kötelező válasz megvan → ellenőrzésre vár. */
  async submitGuest(session: IntakeSession, signatureDataUrl: string): Promise<IntakeGuestViewDto> {
    this.assertGuestEditable(session);
    if (dataUrlBytes(signatureDataUrl) > INTAKE_SIGNATURE_MAX_BYTES) {
      throw appError('INTAKE.SIGNATURE_REQUIRED', { message: 'Az aláírás képe túl nagy.' });
    }
    const forms = await this.definitions.formsByRefs(readFormRefs(session.formRefs));
    const health = await this.prisma.intakeHealthRecord.findUnique({
      where: { sessionId: session.id },
    });
    const answers = { ...readAnswerSet(session.answers), ...readAnswerSet(health?.answers) };
    const missing = forms
      .map((f) => ({ formKey: f.key, questionIds: missingRequiredAnswers(f, answers[f.key] ?? {}) }))
      .filter((m) => m.questionIds.length > 0);
    if (missing.length > 0) throw appError('INTAKE.ANSWERS_INCOMPLETE', { details: { missing } });

    const status = nextIntakeStatus(IntakeStatus.GUEST_FILLING, 'GUEST_SUBMITTED')!;
    const { count } = await this.prisma.intakeSession.updateMany({
      where: { id: session.id, status: { in: GUEST_EDITABLE } },
      data: { status, signatureDataUrl, signedAt: new Date() },
    });
    if (count !== 1) throw appError('INTAKE.INVALID_TRANSITION');
    this.emitUpdated({ ...session, status });
    return this.getGuestView({ ...session, status });
  }

  /**
   * Kilépés a vendégmódból: csak a munkatárs kilépési kódjával. Ha a vendégmód munkatársi
   * munkamenetből indult ezen az eszközön, a munkatárs új munkamenetet kap (a régit a kliens
   * a vendégmód előtt eldobta), különben a tablet a várakozó képernyőre áll vissza.
   */
  async exitGuestMode(session: IntakeSession, exitCode: string): Promise<IntakeGuestExitResponseDto> {
    if (session.exitAttempts >= INTAKE_EXIT_MAX_ATTEMPTS) throw appError('INTAKE.EXIT_LOCKED');
    if (!exitCodeMatches(this.secret, session.id, exitCode, session.exitCodeHash)) {
      await this.prisma.intakeSession.update({
        where: { id: session.id },
        data: { exitAttempts: { increment: 1 } },
      });
      throw appError('INTAKE.EXIT_CODE_INVALID');
    }
    await this.prisma.intakeSession.update({
      where: { id: session.id },
      data: {
        guestTokenHash: null,
        guestTokenExpiresAt: null,
        assignedDeviceId: null,
        exitCodeHash: null,
      },
    });
    if (!session.handoverUserId) return { released: true };
    const user = await this.prisma.user.findUnique({ where: { id: session.handoverUserId } });
    if (!user || !user.isActive) return { released: true };
    const staff: AuthUserDto = {
      id: user.id,
      studioId: user.studioId,
      email: user.email,
      name: user.name,
      role: user.role as unknown as Role,
    };
    const accessToken = await this.jwt.signAsync({
      sub: staff.id,
      email: staff.email,
      studioId: staff.studioId,
      role: staff.role,
      name: staff.name,
    });
    return { released: true, staff: { accessToken, user: staff } };
  }

  // -------------------------------------------------------------------------------------------
  // Segédek
  // -------------------------------------------------------------------------------------------

  private assertGuestEditable(session: IntakeSession) {
    if (!isIntakeEditableByGuest(session.status as IntakeStatus)) {
      throw appError('INTAKE.INVALID_TRANSITION');
    }
  }

  /** Feltételes állapotváltás: csak az elvárt állapotból (párhuzamos kérésnél 409). */
  private async transition(
    sessionId: string,
    studioId: string,
    event: IntakeEvent,
    data: Prisma.IntakeSessionUncheckedUpdateManyInput = {},
  ): Promise<IntakeStatus> {
    const session = await this.loadSession(sessionId, studioId);
    const current = session.status as IntakeStatus;
    const next = nextIntakeStatus(current, event);
    if (next === null) throw appError('INTAKE.INVALID_TRANSITION');
    const { count } = await this.prisma.intakeSession.updateMany({
      where: { id: sessionId, status: current },
      data: { ...data, status: next },
    });
    if (count !== 1) throw appError('INTAKE.INVALID_TRANSITION');
    this.emitUpdated({ id: sessionId, studioId, status: next });
    return next;
  }

  /** Új vendég létrehozása vagy a meglévő frissítése (csak a kitöltött mezők). */
  private async syncGuestProfile(
    tx: Prisma.TransactionClient,
    guestId: string | null,
    profile: IntakeProfileDraft,
    studioId: string,
  ): Promise<string> {
    const fields = {
      lastName: profile.lastName!.trim(),
      firstName: profile.firstName!.trim(),
      ...(trimOrNull(profile.email) ? { email: trimOrNull(profile.email) } : {}),
      ...(trimOrNull(profile.phone) ? { phone: trimOrNull(profile.phone) } : {}),
      ...(profile.birthDate ? { birthDate: new Date(profile.birthDate) } : {}),
      ...(profile.gender ? { gender: profile.gender } : {}),
    };
    if (guestId) {
      const existing = await tx.guest.findFirst({ where: { id: guestId, studioId } });
      if (!existing) throw appError('GUEST.NOT_FOUND');
      await tx.guest.update({ where: { id: guestId }, data: fields });
      return guestId;
    }
    const created = await tx.guest.create({
      data: { studioId, barcode: await this.uniqueBarcode(tx, studioId), ...fields },
    });
    return created.id;
  }

  private async uniqueBarcode(tx: Prisma.TransactionClient, studioId: string): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const candidate = `RS${randomInt(100000, 999999)}`;
      const taken = await tx.guest.findUnique({
        where: { studioId_barcode: { studioId, barcode: candidate } },
      });
      if (!taken) return candidate;
    }
    return `RS${Date.now().toString().slice(-6)}`;
  }

  private async loadSession(sessionId: string, studioId: string): Promise<SessionWithRelations> {
    const session = await this.prisma.intakeSession.findFirst({
      where: { id: sessionId, studioId },
      include: sessionInclude,
    });
    if (!session) throw appError('INTAKE.NOT_FOUND');
    return session;
  }

  private async loadSnapshot(snapshotId: string, studioId: string) {
    const snapshot = await this.prisma.intakeDocumentSnapshot.findFirst({
      where: { id: snapshotId, guest: { studioId } },
      include: { guest: true },
    });
    if (!snapshot) throw appError('INTAKE.DOCUMENT_NOT_FOUND');
    return snapshot;
  }

  private async packageLabels(studioId: string): Promise<Map<string, string>> {
    const packages = await this.definitions.packages(studioId);
    return new Map(packages.map((p) => [p.key, p.label]));
  }

  private async packageLabelsFor(session: IntakeSession): Promise<string[]> {
    const labels = await this.packageLabels(session.studioId);
    return session.packageKeys.map((k) => labels.get(k) ?? k);
  }

  private toSummary(
    session: SessionWithRelations,
    labels: Map<string, string>,
  ): IntakeSessionSummaryDto {
    return {
      id: session.id,
      status: session.status as IntakeStatus,
      source: session.source === 'TABLET' ? 'TABLET' : 'PC',
      guestId: session.guestId,
      guestName: guestDisplayName(session),
      packageKeys: session.packageKeys,
      packageLabels: session.packageKeys.map((k) => labels.get(k) ?? k),
      assignedDeviceId: session.assignedDeviceId,
      assignedDeviceName: session.assignedDevice?.name ?? null,
      createdByName: session.createdBy?.name ?? 'Recepció',
      failureReason: session.failureReason,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }

  private toSnapshotDto(row: IntakeDocumentSnapshot): IntakeDocumentSnapshotDto {
    return {
      id: row.id,
      sessionId: row.sessionId,
      guestId: row.guestId,
      formKey: row.formKey,
      formVersion: row.formVersion,
      title: row.title,
      signedAt: row.signedAt.toISOString(),
      legalReviewPending: row.legalReviewPending,
      pdfAvailable: Boolean(row.pdfStorageKey),
      pdfSizeBytes: row.pdfSizeBytes,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async audit(
    user: AuthUserDto,
    action: string,
    entityId: string,
    details: string,
    entityType = 'IntakeSession',
  ) {
    await this.prisma.auditLog.create({
      data: { studioId: user.studioId, userId: user.id, action, entityType, entityId, details },
    });
  }

  private emitUpdated(session: Pick<IntakeSession, 'id' | 'studioId' | 'status'>) {
    this.gateway?.emitIntakeUpdated(
      { sessionId: session.id, status: session.status as IntakeStatus },
      session.studioId,
    );
  }

  private emitReleased(sessionId: string, deviceId: string) {
    this.gateway?.emitToDevice(SOCKET_EVENTS.INTAKE_RELEASED, { sessionId, deviceId });
  }
}

