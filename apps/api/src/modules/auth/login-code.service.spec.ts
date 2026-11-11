import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginCodeService } from './login-code.service';

const START = new Date('2026-11-11T15:42:00.000Z');

interface CodeRow {
  id: string;
  email: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

interface UserRow {
  id: string;
  studioId: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'RECEPTIONIST';
  isActive: boolean;
}

const asTime = (v: unknown) => (v instanceof Date ? v.getTime() : v);

/** A szolgáltatás által használt `where` alakok: egyenlőség, `null`, és `lt` / `gt` / `gte`. */
function matches(row: CodeRow, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = asTime(row[key as keyof CodeRow]);
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as { lt?: Date; gt?: Date; gte?: Date };
      if (c.lt && !((value as number) < c.lt.getTime())) return false;
      if (c.gt && !((value as number) > c.gt.getTime())) return false;
      if (c.gte && !((value as number) >= c.gte.getTime())) return false;
      return true;
    }
    return value === asTime(cond);
  });
}

function createFakePrisma(users: UserRow[]) {
  const codes: CodeRow[] = [];
  let seq = 0;
  const newestFirst = (rows: CodeRow[]) =>
    [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));

  const prisma = {
    codes,
    user: {
      findUnique: vi.fn(async ({ where }: { where: { email: string } }) =>
        users.find((u) => u.email === where.email) ?? null,
      ),
    },
    loginCode: {
      deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const keep = codes.filter((r) => !matches(r, where));
        const count = codes.length - keep.length;
        codes.splice(0, codes.length, ...keep);
        return { count };
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        newestFirst(codes.filter((r) => matches(r, where))),
      ),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        newestFirst(codes.filter((r) => matches(r, where)))[0] ?? null,
      ),
      updateMany: vi.fn(
        async ({ where, data }: { where: Record<string, unknown>; data: Partial<CodeRow> }) => {
          const rows = codes.filter((r) => matches(r, where));
          rows.forEach((r) => Object.assign(r, data));
          return { count: rows.length };
        },
      ),
      create: vi.fn(async ({ data }: { data: Pick<CodeRow, 'email' | 'codeHash' | 'expiresAt'> }) => {
        seq += 1;
        const row: CodeRow = {
          id: `code-${String(seq).padStart(3, '0')}`,
          attempts: 0,
          consumedAt: null,
          createdAt: new Date(),
          ...data,
        };
        codes.push(row);
        return row;
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const index = codes.findIndex((r) => r.id === where.id);
        return codes.splice(index, 1)[0];
      }),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return prisma;
}

const USERS: UserRow[] = [
  {
    id: 'user-1',
    studioId: 'default-studio',
    email: 'smark.siklodi@gmail.com',
    name: 'Siklódi Márk',
    role: 'ADMIN',
    isActive: true,
  },
  {
    id: 'user-2',
    studioId: 'default-studio',
    email: 'admin@reformstudio.hu',
    name: 'ReformStudio Adminisztrátor',
    role: 'ADMIN',
    isActive: false,
  },
];

const MARK = 'smark.siklodi@gmail.com';

describe('LoginCodeService — belépés e-mailben küldött kóddal (TICKET-35)', () => {
  let prisma: ReturnType<typeof createFakePrisma>;
  let mail: { isConfigured: boolean; send: ReturnType<typeof vi.fn> };
  let env: Record<string, string | undefined>;
  let service: LoginCodeService;

  const advance = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));
  /** Az utolsó kiküldött levél kódja (a tárgy elején áll). */
  const lastMailedCode = () => {
    const [, message] = mail.send.mock.calls.at(-1) as [unknown, { subject: string }];
    return message.subject.slice(0, 6);
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(START);
    prisma = createFakePrisma(USERS.map((u) => ({ ...u })));
    mail = { isConfigured: true, send: vi.fn().mockResolvedValue(undefined) };
    env = { JWT_SECRET: 'test-secret', NODE_ENV: 'test' };
    const config = { get: (key: string) => env[key] };
    const jwt = { signAsync: vi.fn().mockResolvedValue('signed-jwt') };
    service = new LoginCodeService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jwt as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mail as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config as any,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('munkatárs címére levelet küld, a kóddal belép, és a kód csak egyszer használható', async () => {
    await expect(service.requestCode({ email: ' SMark.Siklodi@gmail.com ' })).resolves.toEqual({ ok: true });

    expect(mail.send).toHaveBeenCalledTimes(1);
    const [to, message] = mail.send.mock.calls[0] as [
      { email: string; name: string },
      { subject: string; html: string; text: string },
    ];
    expect(to).toEqual({ email: MARK, name: 'Siklódi Márk' });
    const code = lastMailedCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(message.subject).toBe(`${code} – ReformStudio Sync belépőkód`);
    expect(message.html).toContain('Szia Márk!');
    expect(message.text).toContain(code);

    // Csak a hash van tárolva, maga a kód nem.
    expect(prisma.codes).toHaveLength(1);
    expect(prisma.codes[0].codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(prisma.codes[0].codeHash).not.toContain(code);
    expect(prisma.codes[0].expiresAt.getTime() - START.getTime()).toBe(10 * 60 * 1000);

    await expect(service.verifyCode({ email: MARK, code })).resolves.toEqual({
      accessToken: 'signed-jwt',
      user: {
        id: 'user-1',
        studioId: 'default-studio',
        email: MARK,
        name: 'Siklódi Márk',
        role: 'ADMIN',
      },
    });
    await expect(service.verifyCode({ email: MARK, code })).rejects.toMatchObject({
      code: 'AUTH.CODE_INVALID',
    });
  });

  it.each([
    ['ismeretlen', 'nincs.ilyen@example.com'],
    ['inaktív', 'admin@reformstudio.hu'],
  ])('%s címre ugyanaz a válasz, levél nélkül, és semmilyen kód nem jó', async (_label, email) => {
    await expect(service.requestCode({ email })).resolves.toEqual({ ok: true });

    expect(mail.send).not.toHaveBeenCalled();
    expect(prisma.codes).toHaveLength(1);
    await expect(service.verifyCode({ email, code: '123456' })).rejects.toMatchObject({
      code: 'AUTH.CODE_INVALID',
    });
  });

  it('hibás kódra CODE_INVALID; az 5. hibás próbálkozás után a helyes kód sem jó', async () => {
    await service.requestCode({ email: MARK });
    const code = lastMailedCode();
    const wrong = code === '000000' ? '111111' : '000000';

    for (let i = 1; i <= 4; i++) {
      await expect(service.verifyCode({ email: MARK, code: wrong })).rejects.toMatchObject({
        code: 'AUTH.CODE_INVALID',
        status: 400,
      });
    }
    await expect(service.verifyCode({ email: MARK, code: wrong })).rejects.toMatchObject({
      code: 'AUTH.CODE_INVALID',
      message: expect.stringContaining('Túl sok hibás próbálkozás'),
    });
    await expect(service.verifyCode({ email: MARK, code })).rejects.toMatchObject({
      code: 'AUTH.CODE_INVALID',
    });
  });

  it('a kód 10 perc után lejár', async () => {
    await service.requestCode({ email: MARK });
    const code = lastMailedCode();

    advance(10 * 60 * 1000 + 1);
    await expect(service.verifyCode({ email: MARK, code })).rejects.toMatchObject({
      code: 'AUTH.CODE_INVALID',
    });
  });

  it('új kód kérése után a korábbi kód nem működik, az új igen', async () => {
    await service.requestCode({ email: MARK });
    const oldCode = lastMailedCode();

    advance(61 * 1000);
    await service.requestCode({ email: MARK });
    const newCode = lastMailedCode();

    if (oldCode !== newCode) {
      await expect(service.verifyCode({ email: MARK, code: oldCode })).rejects.toMatchObject({
        code: 'AUTH.CODE_INVALID',
      });
    }
    await expect(service.verifyCode({ email: MARK, code: newCode })).resolves.toMatchObject({
      accessToken: 'signed-jwt',
    });
  });

  it.each([MARK, 'nincs.ilyen@example.com'])(
    'címenként percenként egy, óránként öt kód (%s)',
    async (email) => {
      await service.requestCode({ email });
      await expect(service.requestCode({ email })).rejects.toMatchObject({
        code: 'AUTH.CODE_RATE_LIMITED',
        status: 429,
      });

      for (let i = 2; i <= 5; i++) {
        advance(61 * 1000);
        await expect(service.requestCode({ email })).resolves.toEqual({ ok: true });
      }
      advance(61 * 1000);
      await expect(service.requestCode({ email })).rejects.toMatchObject({
        code: 'AUTH.CODE_RATE_LIMITED',
      });

      // Egy óra múlva újra kérhető; másik címet a korlát nem érint.
      advance(60 * 60 * 1000);
      await expect(service.requestCode({ email })).resolves.toEqual({ ok: true });
    },
  );

  it('a korlát nem érint másik címet', async () => {
    await service.requestCode({ email: MARK });
    await expect(service.requestCode({ email: 'masik@example.com' })).resolves.toEqual({ ok: true });
  });

  it('sikertelen levélküldésnél MAIL_UNAVAILABLE, és rögtön újra lehet próbálni', async () => {
    const { appError } = await import('@reform/shared');
    mail.send.mockRejectedValueOnce(appError('AUTH.MAIL_UNAVAILABLE'));

    await expect(service.requestCode({ email: MARK })).rejects.toMatchObject({
      code: 'AUTH.MAIL_UNAVAILABLE',
      status: 502,
    });
    expect(prisma.codes).toHaveLength(0);

    await expect(service.requestCode({ email: MARK })).resolves.toEqual({ ok: true });
    expect(mail.send).toHaveBeenCalledTimes(2);
  });

  it('SendPulse kulcs nélkül nem küld levelet (a kód a naplóba kerül), de a kód működik', async () => {
    mail.isConfigured = false;

    await expect(service.requestCode({ email: MARK })).resolves.toEqual({ ok: true });
    expect(mail.send).not.toHaveBeenCalled();
    expect(prisma.codes).toHaveLength(1);
  });

  it('AUTH_FIXED_LOGIN_CODE mellett a rögzített kóddal belép, levél és kéréskorlát nélkül', async () => {
    env.AUTH_FIXED_LOGIN_CODE = '123456';

    await service.requestCode({ email: MARK });
    await service.requestCode({ email: MARK });
    expect(mail.send).not.toHaveBeenCalled();
    await expect(service.verifyCode({ email: MARK, code: '123456' })).resolves.toMatchObject({
      accessToken: 'signed-jwt',
    });
  });

  it('productionben az AUTH_FIXED_LOGIN_CODE hatástalan', async () => {
    env.AUTH_FIXED_LOGIN_CODE = '123456';
    env.NODE_ENV = 'production';

    await service.requestCode({ email: MARK });
    expect(mail.send).toHaveBeenCalledTimes(1);
    if (lastMailedCode() !== '123456') {
      await expect(service.verifyCode({ email: MARK, code: '123456' })).rejects.toMatchObject({
        code: 'AUTH.CODE_INVALID',
      });
    }
  });
});
