import { MembershipStatus, OverdueBucket } from '@reform/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FinanceService } from './finance.service';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function membershipRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mem-1',
    studioId: 'default-studio',
    guestId: 'g1',
    monthlyFeeHuf: 22000,
    startDate: day('2026-09-05'),
    dueDay: 10,
    status: 'ACTIVE',
    pausedAt: null,
    terminatedAt: null,
    resumedAt: null,
    createdAt: day('2026-09-05'),
    dues: [],
    ...overrides,
  };
}

describe('FinanceService — havi tagdíj-esedékességek pótlása (TICKET-13)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let txMock: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prismaMock: any;
  let service: FinanceService;

  const setNow = (iso: string) => vi.setSystemTime(new Date(iso));
  const createdPeriods = () =>
    txMock.membershipDue.createMany.mock.calls.flatMap(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ([arg]: any[]) => arg.data.map((d: { period: string }) => d.period),
    );

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    txMock = {
      membership: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        findUniqueOrThrow: vi.fn().mockResolvedValue(membershipRow()),
        update: vi.fn().mockResolvedValue(membershipRow()),
      },
      membershipDue: {
        createMany: vi.fn(async ({ data }) => ({ count: data.length })),
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    prismaMock = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $transaction: vi.fn(async (cb: any) => cb(txMock)),
      membership: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue(membershipRow()),
      },
    };
    service = new FinanceService(prismaMock);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('a hiányzó 2. és 3. hónapot létrehozza, ismételt futásra nem duplikál', async () => {
    const now = new Date('2026-11-08T09:00:00Z');
    txMock.membership.findMany.mockResolvedValueOnce([
      membershipRow({ dues: [{ period: '2026-09' }] }),
    ]);

    expect(await service.ensureDuesUpTo(now)).toBe(2);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    const [{ data, skipDuplicates }] = txMock.membershipDue.createMany.mock.calls[0];
    expect(skipDuplicates).toBe(true);
    expect(data).toEqual([
      expect.objectContaining({
        membershipId: 'mem-1',
        period: '2026-10',
        dueDate: day('2026-10-10'),
        amountHuf: 22000,
        status: 'PENDING',
      }),
      expect.objectContaining({ period: '2026-11', dueDate: day('2026-11-10') }),
    ]);

    // Második futás: minden időszak megvan → nincs írás
    txMock.membership.findMany.mockResolvedValueOnce([
      membershipRow({
        dues: [{ period: '2026-09' }, { period: '2026-10' }, { period: '2026-11' }],
      }),
    ]);
    expect(await service.ensureDuesUpTo(now)).toBe(0);
    expect(txMock.membershipDue.createMany).toHaveBeenCalledTimes(1);
  });

  it('szüneteltetett tagságnál a szünet utáni hónapra nem keletkezik esedékesség', async () => {
    txMock.membership.findMany.mockResolvedValueOnce([
      membershipRow({
        startDate: day('2026-08-01'),
        status: 'PAUSED',
        pausedAt: new Date('2026-10-05T12:00:00Z'),
      }),
    ]);
    await service.ensureDuesUpTo(new Date('2026-12-15T09:00:00Z'));
    expect(createdPeriods()).toEqual(['2026-08', '2026-09']);
  });

  it('ensureDuesForGuest a hívó tranzakciójában is fut, vendégre szűrve', async () => {
    await service.ensureDuesForGuest('g1', new Date('2026-11-08T09:00:00Z'), txMock);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(txMock.membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { guestId: 'g1' } }),
    );

    await service.ensureDuesForGuest('g1', new Date('2026-11-08T09:00:00Z'));
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  const createdDues = () => prismaMock.membership.create.mock.calls[0][0].data.dues.create;

  it('createMembership: kezdés 20-án, dueDay 10 → nincs azonnali esedékesség', async () => {
    setNow('2026-11-20T10:00:00Z');

    await service.createMembership({
      guestId: 'g1',
      monthlyFeeHuf: 22000,
      startDate: '2026-11-20',
      dueDay: 10,
    });

    expect(createdDues()).toEqual([]);
  });

  it('createMembership: kezdés 5-én, dueDay 10 → az adott hónap esedékes 10-én', async () => {
    setNow('2026-11-05T10:00:00Z');

    await service.createMembership({
      guestId: 'g1',
      monthlyFeeHuf: 22000,
      startDate: '2026-11-05',
    });

    expect(createdDues()).toEqual([
      expect.objectContaining({
        period: '2026-11',
        dueDate: day('2026-11-10'),
        amountHuf: 22000,
        status: 'PENDING',
      }),
    ]);
  });

  it('szüneteltetés: pótol, rögzíti a szünet napját és törli a szünet utáni érintetlen díjat', async () => {
    setNow('2026-11-05T10:00:00Z');
    txMock.membership.findFirst.mockResolvedValue(membershipRow());
    const untouched = { status: 'PENDING', paidAmountHuf: 0 };
    txMock.membershipDue.findMany.mockResolvedValue([
      { id: 'due-nov', dueDate: day('2026-11-10'), ...untouched },
      { id: 'due-nov-partial', dueDate: day('2026-11-10'), status: 'PARTIAL', paidAmountHuf: 5000 },
      { id: 'due-oct', dueDate: day('2026-10-10'), ...untouched },
    ]);

    await service.updateMembershipStatus('mem-1', { status: MembershipStatus.PAUSED });

    expect(txMock.membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'mem-1' } }),
    );
    expect(txMock.membership.update).toHaveBeenCalledWith({
      where: { id: 'mem-1' },
      data: expect.objectContaining({
        status: MembershipStatus.PAUSED,
        pausedAt: new Date('2026-11-05T10:00:00Z'),
        terminatedAt: null,
      }),
    });
    expect(txMock.membershipDue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { membershipId: 'mem-1', allocations: { none: {} } },
      }),
    );
    expect(txMock.membershipDue.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['due-nov'] } },
    });
  });

  it('újraaktiválás: rögzíti a resumedAt-ot, nem töröl', async () => {
    setNow('2026-12-15T10:00:00Z');
    txMock.membership.findFirst.mockResolvedValue(
      membershipRow({ status: 'PAUSED', pausedAt: day('2026-11-05') }),
    );

    await service.updateMembershipStatus('mem-1', { status: MembershipStatus.ACTIVE });

    expect(txMock.membership.update).toHaveBeenCalledWith({
      where: { id: 'mem-1' },
      data: expect.objectContaining({
        status: MembershipStatus.ACTIVE,
        pausedAt: null,
        resumedAt: new Date('2026-12-15T10:00:00Z'),
      }),
    });
    expect(txMock.membershipDue.deleteMany).not.toHaveBeenCalled();
  });

  it('getOverdueMemberships: előbb pótol, majd helyes késési kategóriákba sorol', async () => {
    setNow('2026-11-20T10:00:00Z');
    const guest = { firstName: 'Anna', lastName: 'Kovács', barcode: '1', phone: null };
    const due = (id: string, dueDate: string, paid = 0) => ({
      id,
      membershipId: 'mem-1',
      period: dueDate.slice(0, 7),
      dueDate: day(dueDate),
      amountHuf: 22000,
      paidAmountHuf: paid,
      status: paid ? 'PARTIAL' : 'PENDING',
    });
    prismaMock.membership.findMany.mockResolvedValue([
      membershipRow({
        guest,
        dues: [
          due('d-20', '2026-11-20'), // ma esedékes → még nem késik
          due('d-17', '2026-11-17'), // 3 nap
          due('d-10', '2026-11-10', 12000), // 10 nap, részben fizetve
          due('d-oct', '2026-10-10'), // 41 nap
        ],
      }),
    ]);

    const report = await service.getOverdueMemberships();

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(report.buckets.DAYS_1_5.map((i) => i.dueId)).toEqual(['d-17']);
    expect(report.buckets.DAYS_6_15.map((i) => i.dueId)).toEqual(['d-10']);
    expect(report.buckets.DAYS_OVER_15.map((i) => i.dueId)).toEqual(['d-oct']);
    expect(report.buckets.DAYS_6_15[0]).toMatchObject({
      overdueDays: 10,
      remainingHuf: 10000,
      overdueBucket: OverdueBucket.DAYS_6_15,
    });
    expect(report.totalOverdueHuf).toBe(22000 + 10000 + 22000);
  });
});
