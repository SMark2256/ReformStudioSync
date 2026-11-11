import {
  ARRIVAL_DENIED_MESSAGES,
  CheckInStatus,
  Gender,
  PassType,
  PaymentMethod,
} from '@reform/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockStudioEngine } from './mock-engine';

const errorOf = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return null;
};

/** TICKET-42: a böngészős mock ugyanúgy kezeli a csak nőknek szóló köredzést, mint az API. */
describe('mock-engine — csak nőknek szóló köredzés (TICKET-42)', () => {
  beforeEach(() => {
    localStorage.clear();
    mockStudioEngine.resetDatabase();
  });

  it('a demóvendégek neme: Kovács Anna nő, Nagy Péter és Tóth Gábor férfi', () => {
    expect(mockStudioEngine.getGuestById('guest-1').gender).toBe(Gender.FEMALE);
    expect(mockStudioEngine.getGuestById('guest-2').gender).toBe(Gender.MALE);
    expect(mockStudioEngine.getGuestById('guest-4').gender).toBe(Gender.MALE);
  });

  it('beolvasás: női vendég köredzés tagsággal belép', () => {
    const res = mockStudioEngine.scanCheckIn({ barcode: '100001' });
    expect(res.status).toBe(CheckInStatus.SUCCESS);
    expect(res.mode).toBe('CIRCUIT_GREETING');
  });

  it('beolvasás: férfi vendég csak nőknek szóló tagsággal és lejárt bérlettel elutasítva', () => {
    const res = mockStudioEngine.scanCheckIn({ barcode: '100004' });
    expect(res.status).toBe(CheckInStatus.DENIED);
    expect(res.reason).toBe(ARRIVAL_DENIED_MESSAGES.WOMEN_ONLY);
  });

  it('beolvasás: férfi vendég más érvényes bérlettel a kezelésválasztóba kerül', () => {
    const res = mockStudioEngine.scanCheckIn({ barcode: '100002' });
    expect(res.status).toBe(CheckInStatus.TREATMENT_SELECTION_REQUIRED);
    expect(res.treatmentOptions?.map((o) => o.passId)).toEqual(['pass-2']);
  });

  it('nincs megadva nemnél belép, de GENDER_MISSING figyelmeztetéssel', () => {
    mockStudioEngine.updateGuest('guest-1', { gender: Gender.UNSPECIFIED });
    const res = mockStudioEngine.scanCheckIn({ barcode: '100001' });
    expect(res.status).toBe(CheckInStatus.SUCCESS);
    expect(res.warnings).toContain('GENDER_MISSING');
  });

  it('eladás: férfi vendégnek a köredzés bérlet nem adható el, női vendégnek igen', () => {
    const sell = (guestId: string) =>
      mockStudioEngine.sellPass({
        guestId,
        passTemplateId: 'tpl-unlimited',
        paymentMethod: PaymentMethod.CASH,
      });
    expect(errorOf(() => sell('guest-2'))).toMatchObject({
      code: 'PASS.WOMEN_ONLY',
    });
    expect(sell('guest-3').pass.passTemplateId).toBe('tpl-unlimited');
  });

  it('a köredzés sablon csak nőknek szól, a többi nem', () => {
    const templates = mockStudioEngine.getTemplates();
    expect(templates.find((t) => t.id === 'tpl-unlimited')?.womenOnly).toBe(true);
    expect(templates.find((t) => t.id === 'tpl-10')?.womenOnly).toBe(false);
  });

  it('tagság: férfi vendégnek nem adható el, női vendégnek a köredzéshez kötve', () => {
    expect(
      errorOf(() =>
        mockStudioEngine.createMembership({ guestId: 'guest-2', monthlyFeeHuf: 22000 }),
      ),
    ).toMatchObject({ code: 'PASS.WOMEN_ONLY' });

    const created = mockStudioEngine.createMembership({
      guestId: 'guest-5',
      monthlyFeeHuf: 22000,
    });
    expect(created.serviceId).toBe('srv-circuit');
  });

  it('kezeléslevonás: férfi vendég csak nőknek szóló kezelésre elutasítva, más kezelésre levonható', () => {
    // Szolgáltatáshoz nem kötött alkalmas bérlet: bármely kezelésre levonható lenne.
    const template = mockStudioEngine.createTemplate({
      name: '5 Alkalmas Általános Bérlet',
      serviceId: null,
      type: PassType.OCCASION_BASED,
      totalPasses: 5,
      durationDays: 30,
      price: 30000,
    });
    const sold = mockStudioEngine.sellPass({
      guestId: 'guest-2',
      passTemplateId: template.id,
      paymentMethod: PaymentMethod.CASH,
    });

    expect(
      errorOf(() =>
        mockStudioEngine.deductPassUsage({
          guestId: 'guest-2',
          passId: sold.pass.id,
          serviceId: 'srv-circuit',
        }),
      ),
    ).toMatchObject({ code: 'CHECKIN.WOMEN_ONLY' });

    const res = mockStudioEngine.deductPassUsage({
      guestId: 'guest-2',
      passId: sold.pass.id,
      serviceId: 'srv-hypoxi',
    });
    expect(res.status).toBe(CheckInStatus.SUCCESS);
  });
});
