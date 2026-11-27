import { PaymentMethod } from '@reform/shared';
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

/** TICKET-14: a böngészős mock ugyanazzal a szabállyal számolja a bérlet-hátralékot, mint az API. */
describe('mock-engine — bérlet-hátralék részletfizetésnél (TICKET-14)', () => {
  // A mock azonosítói időbélyegből készülnek, ezért minden művelet más időpontban fut.
  let clock = Date.parse('2026-11-26T09:00:00.000Z');
  const tick = () => vi.setSystemTime((clock += 60_000));

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    tick();
    localStorage.clear();
    mockStudioEngine.resetDatabase();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const sell = (paidAmount?: number) => {
    tick();
    return mockStudioEngine.sellPass({
      guestId: 'guest-3',
      passTemplateId: 'tpl-10',
      paymentMethod: PaymentMethod.CASH,
      paidAmount,
    });
  };
  const pay = (passId: string, amountHuf: number) => {
    tick();
    return mockStudioEngine.recordPayment({
      guestId: 'guest-3',
      amountHuf,
      paymentMethod: PaymentMethod.CASH,
      passId,
    });
  };
  const passOf = (passId: string) =>
    mockStudioEngine.getGuestById('guest-3').passes!.find((p) => p.id === passId)!;

  it('a minta bérletek kifizetettek: nincs hátralék és nincs ismeretlen', () => {
    for (const g of mockStudioEngine.getGuests()) {
      for (const p of g.passes ?? []) {
        expect(p.debtStatus, `${g.lastName} ${p.passTemplateName}`).toBe('NONE');
      }
    }
  });

  it('teljes áras eladás: nincs hátralék', () => {
    const { pass } = sell();
    expect(passOf(pass.id)).toMatchObject({ priceHuf: 54000, paidHuf: 54000, debtHuf: 0, debtStatus: 'NONE', debtSince: null });
  });

  it('részfizetés: hátralék a vendégadatlapon, keletkezési időponttal', () => {
    const { pass, amount } = sell(20000);
    expect(amount).toBe(20000);
    expect(passOf(pass.id)).toMatchObject({ priceHuf: 54000, paidHuf: 20000, debtHuf: 34000, debtStatus: 'OUTSTANDING' });
    expect(passOf(pass.id).debtSince).toEqual(expect.any(String));
  });

  it('a bérlet áránál nagyobb most fizetett összeg nem adható el', () => {
    expect(errorOf(() => sell(54001))).toMatchObject({ code: 'PASS.PAID_EXCEEDS_PRICE' });
  });

  it('részlet csökkenti, a teljes rendezés megszünteti; a részlet sztornója visszaállítja', () => {
    const { pass } = sell(20000);
    const since = passOf(pass.id).debtSince;

    pay(pass.id, 14000);
    expect(passOf(pass.id)).toMatchObject({ debtHuf: 20000, debtStatus: 'OUTSTANDING', debtSince: since });

    const last = pay(pass.id, 20000);
    expect(passOf(pass.id)).toMatchObject({ debtHuf: 0, debtStatus: 'NONE', debtSince: null });

    tick();
    mockStudioEngine.cancelPayment(last.id, 'Téves részlet');
    expect(passOf(pass.id)).toMatchObject({ debtHuf: 20000, debtStatus: 'OUTSTANDING' });
    expect(passOf(pass.id).cancelledAt).toBeFalsy();
    expect(passOf(pass.id).debtSince).toEqual(expect.any(String));
  });

  it('az eladás sztornója megszünteti a hátralékot', () => {
    const { pass, paymentId } = sell(20000);
    tick();
    mockStudioEngine.cancelPayment(paymentId, 'Téves eladás');
    expect(passOf(pass.id)).toMatchObject({ debtHuf: 0, debtStatus: 'NONE', debtSince: null });
  });

  it('más vendég bérletéhez nem rögzíthető befizetés', () => {
    const { pass } = sell(20000);
    expect(
      errorOf(() =>
        mockStudioEngine.recordPayment({
          guestId: 'guest-1',
          amountHuf: 1000,
          paymentMethod: PaymentMethod.CASH,
          passId: pass.id,
        }),
      ),
    ).toMatchObject({ code: 'PASS.NOT_FOUND' });
  });

  it('beolvasáskor a recepció megkapja a bérlet-hátralékot (TICKET-15: a türelmi időn belül nem tilt)', () => {
    sell(20000);
    tick();
    const res = mockStudioEngine.scanCheckIn({ barcode: '100003' });
    expect(res.passDebtHuf).toBe(34000);
    expect(res.passDebtSince).toEqual(expect.any(String));
    expect(res.passDebtUnknown).toBeUndefined();
  });
});
