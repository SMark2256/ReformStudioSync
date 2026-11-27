import { CheckInStatus, PaymentMethod } from '@reform/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockStudioEngine } from './mock-engine';

const errorOf = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return null;
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * TICKET-15: a böngészős mock ugyanazzal a szabállyal tilt tartozásnál (5 nap türelmi idő), és
 * ugyanúgy engedi a kivételes beengedést (kötelező indoklás, CHECKIN_OVERRIDE audit), mint az API.
 */
describe('mock-engine — tartozás miatti elutasítás és kivételes beengedés (TICKET-15)', () => {
  // A mock azonosítói időbélyegből készülnek, ezért minden művelet más időpontban fut.
  let clock = Date.parse('2026-11-26T09:00:00.000Z');
  const tick = (ms = 60_000) => vi.setSystemTime((clock += ms));

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    tick();
    localStorage.clear();
    mockStudioEngine.resetDatabase();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const overrideLogs = () =>
    mockStudioEngine.getAuditLogs().filter((l) => l.action === 'CHECKIN_OVERRIDE');

  describe('tagdíj-elmaradás', () => {
    // Szabó Eszter (#100003): aktív tagság, 9 napja esedékes, részben fizetett tagdíj.
    it('a türelmi időn túl: DENIED, az ok és az összeg a recepciónak, feloldható', () => {
      const res = mockStudioEngine.scanCheckIn({ barcode: '100003' });
      expect(res.status).toBe(CheckInStatus.DENIED);
      expect(res.deniedReasonCode).toBe('DUES_OVERDUE');
      expect(res.debtReasons).toEqual(['DUES_OVERDUE']);
      expect(res.overrideAllowed).toBe(true);
      expect(res.overdueAmountHuf).toBe(10000);
      expect(res.reason).toContain('9 nap késés');
    });

    it('a türelmi időn belül (Nagy Péter, 3 nap) nem tilt', () => {
      const res = mockStudioEngine.scanCheckIn({ barcode: '100002' });
      expect(res.status).not.toBe(CheckInStatus.DENIED);
      expect(res.overdueDays).toBe(3);
    });

    it('kivételes beengedés indoklás nélkül: CHECKIN.OVERRIDE_REASON_REQUIRED, nincs belépés', () => {
      const before = mockStudioEngine.getAuditLogs().length;
      expect(
        errorOf(() =>
          mockStudioEngine.scanCheckIn({
            barcode: '100003',
            forceOverride: true,
            overrideReason: ' ',
          }),
        ),
      ).toMatchObject({ code: 'CHECKIN.OVERRIDE_REASON_REQUIRED', status: 400 });
      expect(mockStudioEngine.getAuditLogs()).toHaveLength(before);
    });

    it('kivételes beengedés indoklással: belép, és CHECKIN_OVERRIDE audit rögzül', () => {
      const res = mockStudioEngine.scanCheckIn({
        barcode: '100003',
        forceOverride: true,
        overrideReason: 'Holnap rendezi',
      });
      expect(res.status).toBe(CheckInStatus.SUCCESS);
      expect(res.overridden).toBe(true);
      const [log] = overrideLogs();
      expect(log).toMatchObject({ entityType: 'LoggedCheckIn', entityId: res.checkInId });
      expect(log.details).toContain('Szabó Eszter');
      expect(log.details).toContain('DUES_OVERDUE');
      expect(log.details).toContain('Indoklás: Holnap rendezi');
    });

    it('dupla kattintás: a második kérés dupla leolvasás, nincs második audit', () => {
      const input = {
        barcode: '100003',
        forceOverride: true,
        overrideReason: 'Holnap rendezi',
      };
      mockStudioEngine.scanCheckIn(input);
      tick(1000);
      const second = mockStudioEngine.scanCheckIn(input);
      expect(second.status).toBe(CheckInStatus.DUPLICATE_SCAN);
      expect(overrideLogs()).toHaveLength(1);
    });
  });

  describe('bérlet-hátralék', () => {
    // Kovács Anna (#100001): aktív, kifizetett tagság; részletfizetéssel vett új Reformer bérlet.
    const sellInstallment = () =>
      mockStudioEngine.sellPass({
        guestId: 'guest-1',
        passTemplateId: 'tpl-10',
        paymentMethod: PaymentMethod.CASH,
        paidAmount: 10000,
      });

    it('a vásárlás után az 5. napon még belép, a 6. napon DENIED (PASS_DEBT)', () => {
      sellInstallment();
      tick(5 * DAY);
      expect(mockStudioEngine.scanCheckIn({ barcode: '100001' }).status).toBe(
        CheckInStatus.SUCCESS,
      );
      tick(DAY);
      const res = mockStudioEngine.scanCheckIn({ barcode: '100001' });
      expect(res.status).toBe(CheckInStatus.DENIED);
      expect(res.deniedReasonCode).toBe('PASS_DEBT');
      expect(res.passDebtDays).toBe(6);
      expect(res.overrideAllowed).toBe(true);
    });

    it('kezelés levonása a türelmi időn túl: 409 CHECKIN.DEBT_BLOCKED; indoklással sikeres és naplózott', () => {
      const { pass } = sellInstallment();
      tick(6 * DAY);
      const deduct = (over: Record<string, unknown> = {}) =>
        mockStudioEngine.deductPassUsage({
          guestId: 'guest-1',
          passId: pass.id,
          serviceId: 'srv-reformer',
          ...over,
        });

      expect(errorOf(() => deduct())).toMatchObject({
        code: 'CHECKIN.DEBT_BLOCKED',
        status: 409,
      });
      expect(errorOf(() => deduct({ forceOverride: true }))).toMatchObject({
        code: 'CHECKIN.OVERRIDE_REASON_REQUIRED',
      });

      const res = deduct({ forceOverride: true, overrideReason: 'Részletet hozza' });
      expect(res.status).toBe(CheckInStatus.SUCCESS);
      expect(res.overridden).toBe(true);
      const [log] = overrideLogs();
      expect(log.details).toContain('PASS_DEBT');
      expect(log.details).toContain('Indoklás: Részletet hozza');
    });
  });
});
