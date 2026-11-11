import { Injectable } from '@nestjs/common';
import {
  appError,
  computeRemainingPasses,
  countActiveDeductions,
  DEFAULT_STUDIO_ID,
  DocumentStatus,
  DocumentType,
  Gender,
  GuestDocumentDto,
  getPassStatus,
  GuestDto,
  GuestNoteDto,
  GuestPassDto,
  GuestPhotoDto,
  GuestStatus,
  GUEST_ARRIVALS_LIMIT,
  getOverdueBucket,
  getOverdueDays,
  MeasurementDto,
  MembershipDueStatus,
  MembershipStatus,
  MessageLogDto,
  MessageStatus,
  PassType,
  PaymentMethod,
  Role,
  toGuestArrivals,
} from '@reform/shared';
import { randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { FinanceService } from '../finance/finance.service';
import {
  CreateGuestDocumentDto,
  CreateGuestDto,
  CreateGuestNoteDto,
  CreateGuestPhotoDto,
  CreateMeasurementDto,
  SendGuestMessageDto,
  SignGuestDocumentDto,
  UpdateGuestDto,
} from './guests.dto';

@Injectable()
export class GuestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
  ) {}

  private async generateUniqueBarcode(studioId: string): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const candidate = `RS${randomInt(100000, 999999)}`;
      const exists = await this.prisma.guest.findUnique({
        where: { studioId_barcode: { studioId, barcode: candidate } },
      });
      if (!exists) return candidate;
    }
    return `RS${Date.now().toString().slice(-6)}`;
  }

  private getFullGuestIncludes() {
    return {
      passes: {
        include: {
          passTemplate: { include: { service: true } },
          service: true,
          usageLogs: {
            include: { service: true, employee: true },
            orderBy: { usedAt: 'desc' as const },
          },
        },
        orderBy: { expirationDate: 'asc' as const },
      },
      memberships: {
        include: {
          service: true,
          dues: { orderBy: { dueDate: 'desc' as const } },
        },
        orderBy: { createdAt: 'desc' as const },
      },
      payments: {
        include: {
          guestPass: { include: { passTemplate: true } },
          recordedBy: true,
          allocations: {
            include: {
              membershipDue: true,
              pass: { include: { passTemplate: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' as const },
      },
      measurements: {
        include: { recordedBy: true },
        orderBy: { measuredAt: 'desc' as const },
      },
      photos: {
        include: { service: true },
        orderBy: { takenAt: 'desc' as const },
      },
      documents: {
        orderBy: { createdAt: 'desc' as const },
      },
      internalNotes: {
        include: { author: true },
        orderBy: { createdAt: 'desc' as const },
      },
      messageLogs: {
        orderBy: { sentAt: 'desc' as const },
      },
      // Belépések (TICKET-40): a dupla beolvasás nem belépés.
      checkIns: {
        where: { status: { not: 'DUPLICATE_SCAN' as const } },
        include: {
          user: true,
          guestPass: {
            include: { passTemplate: { include: { service: true } }, service: true },
          },
          passUsage: { include: { service: true } },
        },
        orderBy: { createdAt: 'desc' as const },
        take: GUEST_ARRIVALS_LIMIT,
      },
    };
  }

  async findAll(
    query?: string,
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<GuestDto[]> {
    const q = query?.trim();
    const guests = await this.prisma.guest.findMany({
      where: {
        studioId,
        isActive: true,
        ...(q
          ? {
              OR: [
                { barcode: { contains: q, mode: 'insensitive' } },
                { firstName: { contains: q, mode: 'insensitive' } },
                { lastName: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: this.getFullGuestIncludes(),
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    return guests.map((g) => this.mapGuest(g));
  }

  async findOne(id: string, studioId = DEFAULT_STUDIO_ID): Promise<GuestDto> {
    await this.finance.ensureDuesForGuest(id);
    const guest = await this.prisma.guest.findFirst({
      where: { id, studioId },
      include: this.getFullGuestIncludes(),
    });

    if (!guest) {
      throw appError('GUEST.NOT_FOUND', {
        message: 'A keresett vendég nem található.',
      });
    }

    return this.mapGuest(guest);
  }

  async findGuestPasses(
    guestId: string,
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<GuestPassDto[]> {
    const guest = await this.findOne(guestId, studioId);
    return guest.passes ?? [];
  }

  async create(
    dto: CreateGuestDto,
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<GuestDto> {
    const barcode =
      dto.barcode && dto.barcode.trim().length > 0
        ? dto.barcode.trim()
        : await this.generateUniqueBarcode(studioId);

    const existing = await this.prisma.guest.findUnique({
      where: { studioId_barcode: { studioId, barcode } },
    });

    if (existing) {
      throw appError('GUEST.BARCODE_TAKEN', {
        message: `A(z) "${barcode}" vonalkód már egy másik vendéghez (${existing.lastName} ${existing.firstName}) tartozik.`,
      });
    }

    const created = await this.prisma.guest.create({
      data: {
        studioId,
        barcode,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        email: dto.email?.trim() || null,
        phone: dto.phone?.trim() || null,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
        nameDay: dto.nameDay?.trim() || null,
        gender: dto.gender,
        status: dto.status ?? GuestStatus.ACTIVE,
        notes: dto.notes?.trim() || null,
      },
      include: this.getFullGuestIncludes(),
    });

    return this.mapGuest(created);
  }

  async update(
    id: string,
    dto: UpdateGuestDto,
    studioId = DEFAULT_STUDIO_ID,
  ): Promise<GuestDto> {
    const existing = await this.prisma.guest.findFirst({
      where: { id, studioId },
    });

    if (!existing) {
      throw appError('GUEST.NOT_FOUND');
    }

    if (dto.barcode && dto.barcode.trim() !== existing.barcode) {
      const collision = await this.prisma.guest.findUnique({
        where: {
          studioId_barcode: { studioId, barcode: dto.barcode.trim() },
        },
      });
      if (collision) {
        throw appError('GUEST.BARCODE_TAKEN', {
          message: `A(z) "${dto.barcode.trim()}" vonalkód már foglalt (${collision.lastName} ${collision.firstName}).`,
        });
      }
    }

    const updated = await this.prisma.guest.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined
          ? { firstName: dto.firstName.trim() }
          : {}),
        ...(dto.lastName !== undefined
          ? { lastName: dto.lastName.trim() }
          : {}),
        ...(dto.barcode !== undefined ? { barcode: dto.barcode.trim() } : {}),
        ...(dto.email !== undefined ? { email: dto.email?.trim() || null } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
        ...(dto.birthDate !== undefined
          ? { birthDate: dto.birthDate ? new Date(dto.birthDate) : null }
          : {}),
        ...(dto.nameDay !== undefined
          ? { nameDay: dto.nameDay?.trim() || null }
          : {}),
        ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
      },
      include: this.getFullGuestIncludes(),
    });

    return this.mapGuest(updated);
  }

  async addMeasurement(
    guestId: string,
    dto: CreateMeasurementDto,
    staffUserId: string,
  ): Promise<MeasurementDto> {
    const created = await this.prisma.measurement.create({
      data: {
        guestId,
        recordedById: staffUserId,
        measuredAt: dto.measuredAt ? new Date(dto.measuredAt) : new Date(),
        weightKg: dto.weightKg ?? null,
        bodyFatPct: dto.bodyFatPct ?? null,
        muscleMassKg: dto.muscleMassKg ?? null,
        visceralFat: dto.visceralFat ?? null,
        waistCm: dto.waistCm ?? null,
        hipCm: dto.hipCm ?? null,
        thighCm: dto.thighCm ?? null,
        armCm: dto.armCm ?? null,
        chestCm: dto.chestCm ?? null,
        note: dto.note?.trim() || null,
      },
      include: { recordedBy: true },
    });

    return {
      id: created.id,
      guestId: created.guestId,
      measuredAt: created.measuredAt.toISOString(),
      weightKg: created.weightKg,
      bodyFatPct: created.bodyFatPct,
      muscleMassKg: created.muscleMassKg,
      visceralFat: created.visceralFat,
      waistCm: created.waistCm,
      hipCm: created.hipCm,
      thighCm: created.thighCm,
      armCm: created.armCm,
      chestCm: created.chestCm,
      note: created.note,
      recordedByName: created.recordedBy?.name ?? 'Recepció',
    };
  }

  async addPhoto(
    guestId: string,
    dto: CreateGuestPhotoDto,
  ): Promise<GuestPhotoDto> {
    // Szerveroldali méret-ellenőrzés (max ~600 KB optimalizált WebP/JPEG adatfolyam)
    const maxCompressedBytes = 750 * 1024;
    if (
      dto.compressedSizeBytes &&
      dto.compressedSizeBytes > maxCompressedBytes
    ) {
      throw appError('GUEST.PHOTO_TOO_LARGE');
    }

    const created = await this.prisma.guestPhoto.create({
      data: {
        guestId,
        serviceId: dto.serviceId || null,
        fileUrl: dto.fileUrl,
        mimeType: dto.mimeType || 'image/webp',
        originalSizeBytes: dto.originalSizeBytes ?? 0,
        compressedSizeBytes: dto.compressedSizeBytes ?? 0,
        width: dto.width ?? 0,
        height: dto.height ?? 0,
        visibilityRole: dto.visibilityRole ?? Role.RECEPTIONIST,
        note: dto.note?.trim() || null,
      },
      include: { service: true },
    });

    return {
      id: created.id,
      guestId: created.guestId,
      serviceId: created.serviceId,
      serviceName: created.service?.name ?? null,
      takenAt: created.takenAt.toISOString(),
      fileUrl: created.fileUrl,
      mimeType: created.mimeType,
      originalSizeBytes: created.originalSizeBytes,
      compressedSizeBytes: created.compressedSizeBytes,
      width: created.width,
      height: created.height,
      visibilityRole: created.visibilityRole as unknown as Role,
      note: created.note,
    };
  }

  async createDocument(
    guestId: string,
    dto: CreateGuestDocumentDto,
  ): Promise<GuestDocumentDto> {
    const isSigned = Boolean(dto.signatureDataUrl);
    const created = await this.prisma.guestDocument.create({
      data: {
        guestId,
        documentType: dto.documentType,
        title: dto.title.trim(),
        contentText: dto.contentText.trim(),
        fieldsJson: dto.fieldsJson ? JSON.stringify(dto.fieldsJson) : null,
        signatureDataUrl: dto.signatureDataUrl ?? null,
        signedAt: isSigned ? new Date() : null,
        status: isSigned
          ? DocumentStatus.SIGNED
          : DocumentStatus.PENDING_SIGNATURE,
      },
      include: { guest: true },
    });

    return {
      id: created.id,
      guestId: created.guestId,
      guestName: `${created.guest.lastName} ${created.guest.firstName}`,
      documentType: created.documentType as unknown as DocumentType,
      title: created.title,
      contentText: created.contentText,
      fieldsJson: created.fieldsJson ? JSON.parse(created.fieldsJson) : undefined,
      signatureDataUrl: created.signatureDataUrl,
      signedAt: created.signedAt ? created.signedAt.toISOString() : null,
      status: created.status as unknown as DocumentStatus,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async signDocument(
    documentId: string,
    dto: SignGuestDocumentDto,
  ): Promise<GuestDocumentDto> {
    const existing = await this.prisma.guestDocument.findUnique({
      where: { id: documentId },
      include: { guest: true },
    });
    if (!existing) {
      throw appError('GUEST.DOCUMENT_NOT_FOUND');
    }

    const updated = await this.prisma.guestDocument.update({
      where: { id: documentId },
      data: {
        signatureDataUrl: dto.signatureDataUrl,
        fieldsJson: dto.fieldsJson
          ? JSON.stringify(dto.fieldsJson)
          : existing.fieldsJson,
        signedAt: new Date(),
        status: DocumentStatus.SIGNED,
      },
      include: { guest: true },
    });

    return {
      id: updated.id,
      guestId: updated.guestId,
      guestName: `${updated.guest.lastName} ${updated.guest.firstName}`,
      documentType: updated.documentType as unknown as DocumentType,
      title: updated.title,
      contentText: updated.contentText,
      fieldsJson: updated.fieldsJson ? JSON.parse(updated.fieldsJson) : undefined,
      signatureDataUrl: updated.signatureDataUrl,
      signedAt: updated.signedAt ? updated.signedAt.toISOString() : null,
      status: updated.status as unknown as DocumentStatus,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  async listPendingDocuments(): Promise<GuestDocumentDto[]> {
    const docs = await this.prisma.guestDocument.findMany({
      where: { status: DocumentStatus.PENDING_SIGNATURE },
      include: { guest: true },
      orderBy: { createdAt: 'desc' },
    });

    return docs.map((d) => ({
      id: d.id,
      guestId: d.guestId,
      guestName: `${d.guest.lastName} ${d.guest.firstName}`,
      documentType: d.documentType as unknown as DocumentType,
      title: d.title,
      contentText: d.contentText,
      fieldsJson: d.fieldsJson ? JSON.parse(d.fieldsJson) : undefined,
      signatureDataUrl: d.signatureDataUrl,
      signedAt: d.signedAt ? d.signedAt.toISOString() : null,
      status: d.status as unknown as DocumentStatus,
      createdAt: d.createdAt.toISOString(),
    }));
  }

  async addInternalNote(
    guestId: string,
    dto: CreateGuestNoteDto,
    staffUserId: string,
  ): Promise<GuestNoteDto> {
    const created = await this.prisma.guestNote.create({
      data: {
        guestId,
        authorId: staffUserId,
        content: dto.content.trim(),
      },
      include: { author: true },
    });

    return {
      id: created.id,
      guestId: created.guestId,
      authorId: created.authorId,
      authorName: created.author.name,
      content: created.content,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async sendGuestEmailLog(
    guestId: string,
    dto: SendGuestMessageDto,
  ): Promise<MessageLogDto> {
    const guest = await this.prisma.guest.findUnique({
      where: { id: guestId },
    });
    if (!guest) {
      throw appError('GUEST.NOT_FOUND');
    }

    const created = await this.prisma.messageLog.create({
      data: {
        guestId,
        recipientEmail: guest.email || 'nincs-megadva@reform.hu',
        subject: dto.subject.trim(),
        messageType: dto.messageType.trim(),
        status: guest.email ? MessageStatus.DELIVERED : MessageStatus.FAILED,
        errorDetails: guest.email
          ? null
          : 'A vendégnek nincs rögzített e-mail címe.',
      },
    });

    return {
      id: created.id,
      guestId: created.guestId,
      recipientEmail: created.recipientEmail,
      subject: created.subject,
      messageType: created.messageType,
      status: created.status as unknown as MessageStatus,
      sentAt: created.sentAt.toISOString(),
      errorDetails: created.errorDetails,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapGuest(g: any): GuestDto {
    const now = new Date();
    const guestFullName = `${g.lastName} ${g.firstName}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const passes: GuestPassDto[] = (g.passes ?? []).map((p: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const usageLogs = (p.usageLogs ?? []).map((l: any) => ({
        id: l.id,
        guestPassId: l.guestPassId,
        guestId: l.guestId ?? g.id,
        guestName: guestFullName,
        serviceId: l.serviceId ?? null,
        serviceName:
          l.service?.name ??
          p.service?.name ??
          p.passTemplate?.service?.name ??
          p.passTemplate?.name ??
          null,
        passName: p.passTemplate?.name ?? null,
        employeeId: l.employeeId ?? null,
        employeeName: l.employee?.name ?? 'Recepciós Munkatárs',
        delta: l.delta,
        usedAt: l.usedAt.toISOString(),
        reversedAt: l.reversedAt ? l.reversedAt.toISOString() : null,
        reversalReason: l.reversalReason ?? null,
        checkInId: l.checkInId ?? null,
        note: l.note,
      }));

      const calculatedRemainingPasses = computeRemainingPasses(
        p.totalPasses,
        usageLogs,
      );

      return {
        id: p.id,
        studioId: p.studioId,
        guestId: p.guestId,
        passTemplateId: p.passTemplateId,
        passTemplateName: p.passTemplate?.name,
        serviceId: p.serviceId ?? p.passTemplate?.serviceId ?? null,
        serviceName:
          p.service?.name ?? p.passTemplate?.service?.name ?? null,
        type: p.type as PassType,
        totalPasses: p.totalPasses,
        remainingPasses: p.remainingPasses,
        calculatedRemainingPasses,
        usedPassesCount: countActiveDeductions(usageLogs),
        startDate: p.startDate.toISOString(),
        expirationDate: p.expirationDate.toISOString(),
        isActive: p.isActive,
        isFrozen: p.isFrozen,
        frozenAt: p.frozenAt ? p.frozenAt.toISOString() : null,
        cancelledAt: p.cancelledAt ? p.cancelledAt.toISOString() : null,
        status: getPassStatus(
          { ...p, remainingPasses: calculatedRemainingPasses },
          now,
        ),
        createdAt: p.createdAt.toISOString(),
        usageLogs,
      };
    });

    const treatmentHistory = passes
      .flatMap((p) =>
        (p.usageLogs ?? []).map((u) => ({
          ...u,
          remainingAfter: p.calculatedRemainingPasses,
        })),
      )
      .filter((u) => u.delta < 0)
      .sort(
        (a, b) => new Date(b.usedAt).getTime() - new Date(a.usedAt).getTime(),
      );

    return {
      id: g.id,
      studioId: g.studioId,
      barcode: g.barcode,
      firstName: g.firstName,
      lastName: g.lastName,
      email: g.email,
      phone: g.phone,
      birthDate: g.birthDate ? g.birthDate.toISOString().slice(0, 10) : null,
      nameDay: g.nameDay ?? null,
      gender: (g.gender as Gender) ?? Gender.UNSPECIFIED,
      status: (g.status as GuestStatus) ?? GuestStatus.ACTIVE,
      notes: g.notes,
      isActive: g.isActive,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
      passes,
      treatmentHistory,
      arrivals: toGuestArrivals(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (g.checkIns ?? []).map((c: any) => ({
          id: c.id,
          createdAt: c.createdAt,
          visitType: c.visitType,
          status: c.status,
          reason: c.reason ?? null,
          guestPassId: c.guestPassId ?? null,
          passName: c.guestPass?.passTemplate?.name ?? null,
          usageServiceName: c.passUsage?.service?.name ?? null,
          passServiceName:
            c.guestPass?.service?.name ??
            c.guestPass?.passTemplate?.service?.name ??
            null,
          staffName: c.user?.name ?? null,
        })),
      ),
      memberships: (g.memberships ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (m: any) => ({
          id: m.id,
          studioId: m.studioId,
          guestId: m.guestId,
          guestName: guestFullName,
          serviceId: m.serviceId ?? null,
          serviceName: m.service?.name ?? null,
          monthlyFeeHuf: m.monthlyFeeHuf,
          startDate: m.startDate.toISOString(),
          dueDay: m.dueDay,
          status: m.status as MembershipStatus,
          pausedAt: m.pausedAt ? m.pausedAt.toISOString() : null,
          terminatedAt: m.terminatedAt ? m.terminatedAt.toISOString() : null,
          resumedAt: m.resumedAt ? m.resumedAt.toISOString() : null,
          createdAt: m.createdAt.toISOString(),
          dues: (m.dues ?? []).map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (d: any) => {
              const remainingHuf = Math.max(0, d.amountHuf - d.paidAmountHuf);
              const overdueDays =
                remainingHuf > 0 ? getOverdueDays(d.dueDate, now) : 0;
              return {
                id: d.id,
                membershipId: d.membershipId,
                guestId: g.id,
                guestName: guestFullName,
                period: d.period,
                dueDate: d.dueDate.toISOString(),
                amountHuf: d.amountHuf,
                paidAmountHuf: d.paidAmountHuf,
                remainingHuf,
                status: d.status as MembershipDueStatus,
                overdueDays,
                overdueBucket: getOverdueBucket(overdueDays),
                createdAt: d.createdAt.toISOString(),
              };
            },
          ),
        }),
      ),
      payments: (g.payments ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (pay: any) => ({
          id: pay.id,
          studioId: pay.studioId,
          guestId: pay.guestId,
          guestName: guestFullName,
          guestPassId: pay.guestPassId,
          passName: pay.guestPass?.passTemplate?.name ?? null,
          recordedByUserId: pay.recordedByUserId,
          recordedByName: pay.recordedBy?.name ?? 'Recepció',
          amount: Number(pay.amount),
          paymentMethod: pay.paymentMethod as PaymentMethod,
          isCancelled: pay.isCancelled,
          note: pay.note,
          createdAt: pay.createdAt.toISOString(),
        }),
      ),
      measurements: (g.measurements ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ms: any) => ({
          id: ms.id,
          guestId: ms.guestId,
          measuredAt: ms.measuredAt.toISOString(),
          weightKg: ms.weightKg,
          bodyFatPct: ms.bodyFatPct,
          muscleMassKg: ms.muscleMassKg,
          visceralFat: ms.visceralFat,
          waistCm: ms.waistCm,
          hipCm: ms.hipCm,
          thighCm: ms.thighCm,
          armCm: ms.armCm,
          chestCm: ms.chestCm,
          note: ms.note,
          recordedByName: ms.recordedBy?.name ?? 'Recepciós Munkatárs',
        }),
      ),
      photos: (g.photos ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ph: any) => ({
          id: ph.id,
          guestId: ph.guestId,
          serviceId: ph.serviceId,
          serviceName: ph.service?.name ?? null,
          takenAt: ph.takenAt.toISOString(),
          fileUrl: ph.fileUrl,
          mimeType: ph.mimeType,
          originalSizeBytes: ph.originalSizeBytes,
          compressedSizeBytes: ph.compressedSizeBytes,
          width: ph.width,
          height: ph.height,
          visibilityRole: ph.visibilityRole as Role,
          note: ph.note,
        }),
      ),
      documents: (g.documents ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (doc: any) => ({
          id: doc.id,
          guestId: doc.guestId,
          guestName: guestFullName,
          documentType: doc.documentType as DocumentType,
          title: doc.title,
          contentText: doc.contentText,
          fieldsJson: doc.fieldsJson ? JSON.parse(doc.fieldsJson) : undefined,
          signatureDataUrl: doc.signatureDataUrl,
          signedAt: doc.signedAt ? doc.signedAt.toISOString() : null,
          status: doc.status as DocumentStatus,
          createdAt: doc.createdAt.toISOString(),
        }),
      ),
      internalNotes: (g.internalNotes ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (nt: any) => ({
          id: nt.id,
          guestId: nt.guestId,
          authorId: nt.authorId,
          authorName: nt.author?.name ?? 'Recepciós Munkatárs',
          content: nt.content,
          createdAt: nt.createdAt.toISOString(),
        }),
      ),
      messageLogs: (g.messageLogs ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ml: any) => ({
          id: ml.id,
          guestId: ml.guestId,
          guestName: guestFullName,
          recipientEmail: ml.recipientEmail,
          subject: ml.subject,
          messageType: ml.messageType,
          status: ml.status as MessageStatus,
          sentAt: ml.sentAt.toISOString(),
          errorDetails: ml.errorDetails,
        }),
      ),
    };
  }
}
