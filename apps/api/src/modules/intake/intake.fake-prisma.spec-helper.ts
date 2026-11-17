/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';

/**
 * Memóriabeli Prisma-utánzat a vendégfelvétel tesztjeihez (TICKET-56): csak azokat a
 * műveleteket és szűrőket tudja, amelyeket az `intake` modul használ. A `$transaction`
 * callback-változata hibánál visszaállítja a táblákat (rollback), és az aláírt pillanatkép
 * tartalmi oszlopainak módosítását a migráció triggeréhez hasonlóan elutasítja.
 */
type Row = Record<string, any>;

const DEFAULTS: Record<string, () => Row> = {
  guest: () => ({
    studioId: 'default-studio',
    email: null,
    phone: null,
    birthDate: null,
    nameDay: null,
    gender: 'UNSPECIFIED',
    status: 'ACTIVE',
    notes: null,
    isActive: true,
  }),
  intakeSession: () => ({
    studioId: 'default-studio',
    guestId: null,
    linkGuestId: null,
    status: 'PREPARED',
    source: 'PC',
    profileDraft: {},
    answers: {},
    measurementDraft: {},
    profilePhotoDataUrl: null,
    signatureDataUrl: null,
    signedAt: null,
    guestTokenHash: null,
    guestTokenExpiresAt: null,
    exitCodeHash: null,
    exitAttempts: 0,
    handoverUserId: null,
    assignedDeviceId: null,
    approvedById: null,
    approvedAt: null,
    completedAt: null,
    failureReason: null,
  }),
  intakeHealthRecord: () => ({ guestId: null, answers: {}, consentGivenAt: null, approvedAt: null }),
  intakeDocumentSnapshot: () => ({ pdfStorageKey: null, pdfSizeBytes: null, pdfCreatedAt: null }),
  intakeFormDefinition: () => ({ isActive: true, requiresSignature: true, legalReviewPending: true }),
  intakePackage: () => ({ studioId: 'default-studio', description: '', sortOrder: 0, isActive: true }),
  displayDevice: () => ({ studioId: 'default-studio', kind: 'MONITOR', pairingCode: null, isActive: true }),
  user: () => ({ studioId: 'default-studio', isActive: true, role: 'RECEPTIONIST' }),
  measurement: () => ({}),
  guestPhoto: () => ({}),
  auditLog: () => ({ studioId: 'default-studio' }),
  messageLog: () => ({}),
};

const UNIQUE: Record<string, (row: Row) => string> = {
  intakeFormDefinition: (r) => `${r.key}@${r.version}`,
  intakePackage: (r) => `${r.studioId}@${r.key}`,
  intakeDocumentSnapshot: (r) => `${r.sessionId}@${r.formKey}`,
};

/** relációnév → [modell, idegen kulcs a sorban] (egyes) vagy [modell, idegen kulcs a gyerekben] (lista). */
const RELATIONS: Record<string, Record<string, { model: string; key: string; many?: boolean }>> = {
  intakeSession: {
    guest: { model: 'guest', key: 'guestId' },
    createdBy: { model: 'user', key: 'createdById' },
    approvedBy: { model: 'user', key: 'approvedById' },
    assignedDevice: { model: 'displayDevice', key: 'assignedDeviceId' },
    snapshots: { model: 'intakeDocumentSnapshot', key: 'sessionId', many: true },
  },
  intakeDocumentSnapshot: { guest: { model: 'guest', key: 'guestId' } },
};

/** A pillanatképen utólag csak ezek írhatók (a migráció triggere szerint). */
const SNAPSHOT_MUTABLE = new Set(['pdfStorageKey', 'pdfSizeBytes', 'pdfCreatedAt']);

const clone = <T>(value: T): T => structuredClone(value);

const sameValue = (a: unknown, b: unknown) =>
  a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;

export class FakePrisma {
  tables: Record<string, Row[]> = Object.fromEntries(Object.keys(DEFAULTS).map((m) => [m, []]));
  [model: string]: any;

  constructor() {
    for (const model of Object.keys(DEFAULTS)) this[model] = this.delegate(model);
  }

  $transaction = async (arg: any) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    const backup = clone(this.tables);
    try {
      return await arg(this);
    } catch (err) {
      this.tables = backup;
      throw err;
    }
  };

  seed(model: string, row: Row): Row {
    return this.insert(model, row);
  }

  private insert(model: string, data: Row): Row {
    const now = new Date();
    const row = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...DEFAULTS[model](),
      ...clone(data),
    };
    const unique = UNIQUE[model];
    if (unique && this.tables[model].some((r) => unique(r) === unique(row))) {
      throw Object.assign(new Error(`Unique constraint (${model})`), { code: 'P2002' });
    }
    this.tables[model].push(row);
    return row;
  }

  private matches(model: string, row: Row, where: Row | undefined): boolean {
    if (!where) return true;
    return Object.entries(where).every(([key, cond]) => {
      if (key === 'OR') return (cond as Row[]).some((w) => this.matches(model, row, w));
      if (key === 'studioId_barcode') {
        return row.studioId === cond.studioId && row.barcode === cond.barcode;
      }
      const relation = RELATIONS[model]?.[key];
      if (relation && !relation.many) {
        const target = this.tables[relation.model].find((r) => r.id === row[relation.key]);
        return Boolean(target) && this.matches(relation.model, target!, cond);
      }
      const value = row[key];
      if (cond && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond)) {
        if ('in' in cond) return (cond.in as unknown[]).some((v) => sameValue(v, value));
        if ('not' in cond) return !sameValue(value, cond.not);
        if ('gte' in cond) return value >= cond.gte;
        if ('lt' in cond) return value < cond.lt;
      }
      return sameValue(value, cond);
    });
  }

  private withIncludes(model: string, row: Row, include: Row | undefined): Row {
    const result = clone(row);
    for (const [name, spec] of Object.entries(include ?? {})) {
      const relation = RELATIONS[model]?.[name];
      if (!relation || !spec) continue;
      result[name] = relation.many
        ? this.tables[relation.model].filter((r) => r[relation.key] === row.id).map(clone)
        : clone(this.tables[relation.model].find((r) => r.id === row[relation.key]) ?? null);
    }
    return result;
  }

  private apply(model: string, row: Row, data: Row) {
    if (model === 'intakeDocumentSnapshot') {
      const forbidden = Object.keys(data).filter((k) => !SNAPSHOT_MUTABLE.has(k));
      if (forbidden.length > 0) {
        throw new Error(`Az aláírt dokumentum pillanatképe nem módosítható (${forbidden.join(', ')}).`);
      }
    }
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && 'increment' in value) {
        row[key] = (row[key] ?? 0) + (value.increment as number);
      } else {
        row[key] = clone(value);
      }
    }
    row.updatedAt = new Date();
  }

  private sorted(rows: Row[], orderBy: Row | Row[] | undefined): Row[] {
    const orders = orderBy ? (Array.isArray(orderBy) ? orderBy : [orderBy]) : [];
    return [...rows].sort((a, b) => {
      for (const order of orders) {
        const [field, dir] = Object.entries(order)[0] as [string, 'asc' | 'desc'];
        const left = a[field] instanceof Date ? a[field].getTime() : a[field];
        const right = b[field] instanceof Date ? b[field].getTime() : b[field];
        if (left === right) continue;
        return (left < right ? -1 : 1) * (dir === 'desc' ? -1 : 1);
      }
      return 0;
    });
  }

  private delegate(model: string) {
    const rows = () => this.tables[model];
    const find = (args: Row = {}) => rows().filter((r) => this.matches(model, r, args.where));
    return {
      findUnique: async (args: Row) => {
        const row = find(args)[0];
        return row ? this.withIncludes(model, row, args.include) : null;
      },
      findFirst: async (args: Row = {}) => {
        const row = this.sorted(find(args), args.orderBy)[0];
        return row ? this.withIncludes(model, row, args.include) : null;
      },
      findMany: async (args: Row = {}) => {
        let result = this.sorted(find(args), args.orderBy);
        if (args.distinct) {
          const seen = new Set<string>();
          result = result.filter((r) => {
            const key = (args.distinct as string[]).map((f) => String(r[f])).join('|');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }
        if (args.take) result = result.slice(0, args.take);
        return result.map((r) => this.withIncludes(model, r, args.include));
      },
      create: async (args: Row) => this.withIncludes(model, this.insert(model, args.data), args.include),
      createMany: async (args: Row) => {
        let count = 0;
        for (const data of args.data as Row[]) {
          const unique = UNIQUE[model];
          if (args.skipDuplicates && unique && rows().some((r) => unique(r) === unique(data))) continue;
          this.insert(model, data);
          count++;
        }
        return { count };
      },
      update: async (args: Row) => {
        const row = find(args)[0];
        if (!row) throw Object.assign(new Error(`Record not found (${model})`), { code: 'P2025' });
        this.apply(model, row, args.data);
        return this.withIncludes(model, row, args.include);
      },
      updateMany: async (args: Row) => {
        const matched = find(args);
        for (const row of matched) this.apply(model, row, args.data);
        return { count: matched.length };
      },
      upsert: async (args: Row) => {
        const row = find(args)[0];
        if (row) {
          this.apply(model, row, args.update);
          return clone(row);
        }
        return clone(this.insert(model, args.create));
      },
    };
  }
}
