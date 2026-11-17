import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  appError,
  BUILT_IN_INTAKE_FORMS,
  BUILT_IN_INTAKE_PACKAGES,
  DEFAULT_STUDIO_ID,
  IntakeFormDefinitionDto,
  IntakeFormKind,
  IntakePackageDto,
  IntakeQuestion,
} from '@reform/shared';
import { PrismaService } from '../../prisma/prisma.service';

export interface IntakeFormRef {
  key: string;
  version: number;
}

type FormRow = {
  key: string;
  version: number;
  title: string;
  kind: string;
  scope: string;
  sortOrder: number;
  bodyText: string;
  questions: Prisma.JsonValue;
  requiresSignature: boolean;
  legalReviewPending: boolean;
};

export const toFormDto = (row: FormRow): IntakeFormDefinitionDto => ({
  key: row.key,
  version: row.version,
  title: row.title,
  kind: row.kind as IntakeFormKind,
  scope: row.scope,
  order: row.sortOrder,
  bodyText: row.bodyText,
  questions: (Array.isArray(row.questions) ? row.questions : []) as unknown as IntakeQuestion[],
  requiresSignature: row.requiresSignature,
  legalReviewPending: row.legalReviewPending,
});

/**
 * A felvételi csomagok és a verziózott kérdőívek (TICKET-56). A beépítetteket (`@reform/shared`
 * `BUILT_IN_INTAKE_*`) induláskor idempotensen feltölti (a seed is ezt teszi): meglévő
 * (kulcs, verzió) párt nem ír felül, így az aláírt változat szövege nem változik.
 */
@Injectable()
export class IntakeDefinitionsService implements OnModuleInit {
  private readonly logger = new Logger(IntakeDefinitionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.ensureBuiltIns();
    } catch (err) {
      // Elérhetetlen adatbázisnál se álljon le az API; az első kérésnél újra próbálkozunk.
      this.logger.warn(`A vendégfelvétel definíciói nem tölthetők fel: ${String(err)}`);
    }
  }

  async ensureBuiltIns(studioId = DEFAULT_STUDIO_ID): Promise<void> {
    await this.prisma.intakeFormDefinition.createMany({
      data: BUILT_IN_INTAKE_FORMS.map((f) => ({
        key: f.key,
        version: f.version,
        title: f.title,
        kind: f.kind,
        scope: f.scope,
        sortOrder: f.order,
        bodyText: f.bodyText,
        questions: f.questions as unknown as Prisma.InputJsonValue,
        requiresSignature: f.requiresSignature,
        legalReviewPending: f.legalReviewPending,
      })),
      skipDuplicates: true,
    });
    await this.prisma.intakePackage.createMany({
      data: BUILT_IN_INTAKE_PACKAGES.map((p, index) => ({
        studioId,
        key: p.key,
        label: p.label,
        description: p.description,
        formKeys: p.formKeys,
        sortOrder: index,
      })),
      skipDuplicates: true,
    });
  }

  async packages(studioId = DEFAULT_STUDIO_ID): Promise<IntakePackageDto[]> {
    let rows = await this.prisma.intakePackage.findMany({
      where: { studioId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    if (rows.length === 0) {
      await this.ensureBuiltIns(studioId);
      rows = await this.prisma.intakePackage.findMany({
        where: { studioId, isActive: true },
        orderBy: { sortOrder: 'asc' },
      });
    }
    return rows.map((r) => ({
      key: r.key,
      label: r.label,
      description: r.description,
      formKeys: r.formKeys,
    }));
  }

  /** Kulcsonként a legújabb aktív verzió. */
  async activeForms(): Promise<IntakeFormDefinitionDto[]> {
    let rows = await this.prisma.intakeFormDefinition.findMany({
      where: { isActive: true },
      orderBy: [{ key: 'asc' }, { version: 'desc' }],
    });
    if (rows.length === 0) {
      await this.ensureBuiltIns();
      rows = await this.prisma.intakeFormDefinition.findMany({
        where: { isActive: true },
        orderBy: [{ key: 'asc' }, { version: 'desc' }],
      });
    }
    const latest = new Map<string, FormRow>();
    for (const row of rows) if (!latest.has(row.key)) latest.set(row.key, row);
    return [...latest.values()].map(toFormDto).sort((a, b) => a.order - b.order);
  }

  /** A munkamenetben rögzített (kulcs, verzió) űrlapok, a rögzítés sorrendjében. */
  async formsByRefs(refs: IntakeFormRef[]): Promise<IntakeFormDefinitionDto[]> {
    if (refs.length === 0) return [];
    const rows = await this.prisma.intakeFormDefinition.findMany({
      where: { OR: refs.map((r) => ({ key: r.key, version: r.version })) },
    });
    return refs.map((ref) => {
      const row = rows.find((r) => r.key === ref.key && r.version === ref.version);
      if (!row) {
        throw appError('COMMON.INTERNAL', {
          message: `Hiányzó kérdőív-definíció: ${ref.key} v${ref.version}.`,
        });
      }
      return toFormDto(row);
    });
  }
}

export function readFormRefs(value: Prisma.JsonValue): IntakeFormRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const { key, version } = item as Record<string, unknown>;
    return typeof key === 'string' && typeof version === 'number' ? [{ key, version }] : [];
  });
}
