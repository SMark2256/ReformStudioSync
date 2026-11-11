import {
  greetingFields,
  greetingFor,
  greetingForCheckIn,
  ServiceCategory,
} from '@reform/shared';
import { describe, expect, it } from 'vitest';

describe('greetingFor (TICKET-43)', () => {
  it('köredzés: „Köredzés • Érkezés” — „Jó edzést kívánunk!”', () => {
    expect(greetingFor({ category: ServiceCategory.CIRCUIT })).toEqual({
      kind: 'Köredzés',
      label: 'Köredzés • Érkezés',
      wish: 'Jó edzést kívánunk!',
    });
  });

  it('csak nőknek szóló köredzés: „Női Köredzés • Érkezés”', () => {
    expect(
      greetingFor({ category: ServiceCategory.CIRCUIT, womenOnly: true }),
    ).toEqual({
      kind: 'Női Köredzés',
      label: 'Női Köredzés • Érkezés',
      wish: 'Jó edzést kívánunk!',
    });
  });

  it('alakformálás (Hypoxi): „Kezelés • Üdvözlés” — „Kellemes kezelést kívánunk!”', () => {
    expect(greetingFor({ category: ServiceCategory.BODY_SHAPING })).toEqual({
      kind: 'Kezelés',
      label: 'Kezelés • Üdvözlés',
      wish: 'Kellemes kezelést kívánunk!',
    });
  });

  it('kozmetika: „Kozmetika • Üdvözlés” — „Kellemes kikapcsolódást kívánunk!”, „Női” nélkül', () => {
    for (const womenOnly of [false, true]) {
      expect(
        greetingFor({ category: ServiceCategory.COSMETIC, womenOnly }),
      ).toEqual({
        kind: 'Kozmetika',
        label: 'Kozmetika • Üdvözlés',
        wish: 'Kellemes kikapcsolódást kívánunk!',
      });
    }
  });

  it('ismeretlen kategória: semleges címke — „Kellemes időtöltést kívánunk!”', () => {
    for (const category of [null, undefined, 'OTHER']) {
      const greeting = greetingFor({ category });
      expect(greeting.label).toBe('Üdvözlés');
      expect(greeting.wish).toBe('Kellemes időtöltést kívánunk!');
    }
  });
});

describe('greetingForCheckIn (TICKET-43)', () => {
  it('a kategória dönt, nem a mód: kozmetikai kezelésnél nincs „Jó edzést”', () => {
    expect(
      greetingForCheckIn({
        mode: 'TREATMENT_GREETING',
        serviceCategory: ServiceCategory.COSMETIC,
      }).wish,
    ).toBe('Kellemes kikapcsolódást kívánunk!');
    expect(
      greetingForCheckIn({
        mode: 'CIRCUIT_GREETING',
        serviceCategory: ServiceCategory.CIRCUIT,
        womenOnly: true,
      }).label,
    ).toBe('Női Köredzés • Érkezés');
  });

  it('kategória nélküli (régebbi) eseménynél a mód szerinti szöveg, „Női” nélkül', () => {
    expect(greetingForCheckIn({ mode: 'CIRCUIT_GREETING' }).label).toBe(
      'Köredzés • Érkezés',
    );
    expect(greetingForCheckIn({ mode: 'TREATMENT_GREETING' }).wish).toBe(
      'Kellemes kezelést kívánunk!',
    );
  });

  it('kifejezetten ismeretlen (null) kategóriánál semleges szöveg', () => {
    expect(
      greetingForCheckIn({ mode: 'TREATMENT_GREETING', serviceCategory: null })
        .wish,
    ).toBe('Kellemes időtöltést kívánunk!');
  });
});

describe('greetingFields (TICKET-43)', () => {
  it('a szolgáltatás kategóriáját és womenOnly jelzését adja', () => {
    expect(
      greetingFields({ category: 'CIRCUIT', womenOnly: true }),
    ).toEqual({ serviceCategory: ServiceCategory.CIRCUIT, womenOnly: true });
  });

  it('szolgáltatás nélkül a tartalék kategória, alapból ismeretlen', () => {
    expect(greetingFields(null, ServiceCategory.CIRCUIT)).toEqual({
      serviceCategory: ServiceCategory.CIRCUIT,
      womenOnly: false,
    });
    expect(greetingFields(undefined)).toEqual({
      serviceCategory: null,
      womenOnly: false,
    });
  });
});
