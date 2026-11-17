import {
  BUILT_IN_INTAKE_FORMS,
  BUILT_IN_INTAKE_PACKAGES,
  findIntakeDuplicates,
  hasSignableIntakeForms,
  INTAKE_PACKAGE_CIRCUIT,
  INTAKE_PACKAGE_HYPOXI,
  intakeAnswerText,
  intakeWarnings,
  IntakeEvent,
  IntakeStatus,
  isIntakeEditableByGuest,
  isIntakeOpen,
  missingIntakeForms,
  missingRequiredAnswers,
  nextIntakeStatus,
  profileFromAnswers,
  pruneHiddenAnswers,
  requiredIntakeForms,
  sanitizeIntakeMeasurements,
} from '@reform/shared';
import { describe, expect, it } from 'vitest';

// A közös (packages/shared) tiszta vendégfelvételi logika: az API és a kliens mock is ezt hívja.

const form = (key: string) => BUILT_IN_INTAKE_FORMS.find((f) => f.key === key)!;
const health = form('health-questionnaire');

describe('vendégfelvétel állapotgépe (TICKET-56)', () => {
  const ALL_EVENTS: IntakeEvent[] = [
    'GUEST_STARTED',
    'GUEST_SUBMITTED',
    'RETURNED_TO_GUEST',
    'APPROVED',
    'FINALIZED',
    'FINALIZE_FAILED',
    'RETRY',
    'CANCELLED',
  ];

  it('a fő út: előkészítve → kitölti → ellenőrzésre vár → jóváhagyva → lezárva', () => {
    let status = IntakeStatus.PREPARED;
    for (const event of ['GUEST_STARTED', 'GUEST_SUBMITTED', 'APPROVED', 'FINALIZED'] as const) {
      status = nextIntakeStatus(status, event)!;
    }
    expect(status).toBe(IntakeStatus.COMPLETED);
  });

  it('hibás lezárás újrapróbálható, a jóváhagyott állapotba lép vissza', () => {
    expect(nextIntakeStatus(IntakeStatus.APPROVED, 'FINALIZE_FAILED')).toBe(IntakeStatus.FAILED);
    expect(nextIntakeStatus(IntakeStatus.FAILED, 'RETRY')).toBe(IntakeStatus.APPROVED);
    expect(nextIntakeStatus(IntakeStatus.FAILED, 'CANCELLED')).toBeNull();
  });

  it('javításra visszaküldés csak ellenőrzésre váró kitöltésből', () => {
    expect(nextIntakeStatus(IntakeStatus.AWAITING_REVIEW, 'RETURNED_TO_GUEST')).toBe(
      IntakeStatus.GUEST_FILLING,
    );
    expect(nextIntakeStatus(IntakeStatus.GUEST_FILLING, 'RETURNED_TO_GUEST')).toBeNull();
  });

  it('jóváhagyni csak beküldött kitöltést lehet, beküldeni csak kitöltés közben', () => {
    expect(nextIntakeStatus(IntakeStatus.PREPARED, 'APPROVED')).toBeNull();
    expect(nextIntakeStatus(IntakeStatus.GUEST_FILLING, 'APPROVED')).toBeNull();
    expect(nextIntakeStatus(IntakeStatus.PREPARED, 'GUEST_SUBMITTED')).toBeNull();
  });

  it('a lezárt és a megszakított állapotból nincs kilépés', () => {
    for (const event of ALL_EVENTS) {
      expect(nextIntakeStatus(IntakeStatus.COMPLETED, event)).toBeNull();
      expect(nextIntakeStatus(IntakeStatus.CANCELLED, event)).toBeNull();
    }
  });

  it('a vendég csak előkészítve vagy kitöltés közben írhat; nyitott a jóváhagyásig', () => {
    expect(isIntakeEditableByGuest(IntakeStatus.PREPARED)).toBe(true);
    expect(isIntakeEditableByGuest(IntakeStatus.GUEST_FILLING)).toBe(true);
    expect(isIntakeEditableByGuest(IntakeStatus.AWAITING_REVIEW)).toBe(false);
    expect(isIntakeOpen(IntakeStatus.AWAITING_REVIEW)).toBe(true);
    expect(isIntakeOpen(IntakeStatus.APPROVED)).toBe(false);
  });
});

describe('kérdőív-logika', () => {
  it('figyelmeztetés csak a kockázatot jelző válasznál, az adott kérdéshez kötve', () => {
    expect(intakeWarnings(health, { surgeryLast6Weeks: 'NO' })).toEqual([]);
    const warnings = intakeWarnings(health, { surgeryLast6Weeks: 'YES' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      formKey: 'health-questionnaire',
      questionId: 'surgeryLast6Weeks',
    });
  });

  it('a labor kategóriái csak „Igen” esetén látszanak és figyelmeztetnek', () => {
    const hidden = { labLast6Months: 'NO', cholesterolTotal: 'HIGH' };
    expect(intakeWarnings(health, hidden)).toEqual([]);
    expect(pruneHiddenAnswers(health, hidden)).toEqual({ labLast6Months: 'NO' });

    const shown = { labLast6Months: 'YES', cholesterolTotal: 'HIGH', cholesterolHdl: 'NORMAL' };
    expect(intakeWarnings(health, shown).map((w) => w.questionId)).toEqual(['cholesterolTotal']);
    expect(intakeWarnings(health, { labLast6Months: 'YES', cholesterolHdl: 'LOW' })).toHaveLength(1);
  });

  it('kötelező mezők: a rejtett kérdés nem kötelező, az elfogadáshoz ACCEPTED kell', () => {
    const missing = missingRequiredAnswers(health, { labLast6Months: 'NO' });
    expect(missing).toEqual(['surgeryLast6Weeks', 'goals', 'fluidIntake', 'workType']);
    expect(
      missingRequiredAnswers(health, {
        surgeryLast6Weeks: 'NO',
        labLast6Months: 'NO',
        goals: [],
        fluidIntake: '1_2L',
        workType: ' ',
      }),
    ).toEqual(['goals', 'workType']);
    expect(missingRequiredAnswers(form('privacy-notice'), { privacyRead: 'yes' })).toEqual([
      'privacyRead',
    ]);
  });

  it('a marketing-hozzájárulás nincs előre kiválasztva', () => {
    const consent = form('marketing-consent');
    expect(missingRequiredAnswers(consent, {})).toContain('marketingPhotoVideo');
  });
});

describe('csomagok és hiányzó dokumentumok', () => {
  const keys = (forms: { key: string }[]) => forms.map((f) => f.key);

  it('a közös űrlapok a választott csomagokéval sorrendben, ismétlés nélkül', () => {
    const forms = requiredIntakeForms(BUILT_IN_INTAKE_FORMS, BUILT_IN_INTAKE_PACKAGES, [
      INTAKE_PACKAGE_CIRCUIT,
      INTAKE_PACKAGE_HYPOXI,
    ]);
    expect(new Set(keys(forms)).size).toBe(forms.length);
    expect(keys(forms)[0]).toBe('privacy-notice');
    expect(keys(forms).indexOf('health-data-consent')).toBeLessThan(
      keys(forms).indexOf('health-questionnaire'),
    );
    expect(keys(forms).at(-1)).toBe('marketing-consent');
    expect(keys(forms)).toContain('circuit-membership-contract');
    expect(keys(forms)).toContain('hypoxi-informed-consent');
  });

  it('a Hypoxi csomag nem kér köredzés-szerződést (és bérletválasztást sem)', () => {
    const forms = requiredIntakeForms(BUILT_IN_INTAKE_FORMS, BUILT_IN_INTAKE_PACKAGES, [
      INTAKE_PACKAGE_HYPOXI,
    ]);
    expect(keys(forms)).not.toContain('circuit-membership-contract');
    expect(keys(forms)).not.toContain('circuit-contraindications');
  });

  it('meglévő vendégnél csak a még alá nem írt dokumentumok, a profil nélkül', () => {
    const required = requiredIntakeForms(BUILT_IN_INTAKE_FORMS, BUILT_IN_INTAKE_PACKAGES, [
      INTAKE_PACKAGE_CIRCUIT,
      INTAKE_PACKAGE_HYPOXI,
    ]);
    const alreadySigned = requiredIntakeForms(BUILT_IN_INTAKE_FORMS, BUILT_IN_INTAKE_PACKAGES, [
      INTAKE_PACKAGE_CIRCUIT,
    ])
      .filter((f) => f.requiresSignature)
      .map((f) => f.key);

    const missing = keys(missingIntakeForms(required, alreadySigned));
    expect(missing).toEqual(
      expect.arrayContaining(['hypoxi-contraindications', 'hypoxi-informed-consent']),
    );
    expect(missing).not.toContain('guest-profile');
    expect(missing).not.toContain('circuit-membership-contract');
    expect(keys(missingIntakeForms(required, []))).toEqual(keys(required));
  });

  it('ha minden alá van írva, nincs aláírandó dokumentum', () => {
    const required = requiredIntakeForms(BUILT_IN_INTAKE_FORMS, BUILT_IN_INTAKE_PACKAGES, [
      INTAKE_PACKAGE_CIRCUIT,
    ]);
    const all = required.map((f) => f.key);
    expect(hasSignableIntakeForms(missingIntakeForms(required, all))).toBe(false);
  });
});

describe('duplikáció-ellenőrzés', () => {
  const guests = [
    {
      id: 'g1',
      firstName: 'Ödön',
      lastName: 'Fekete',
      barcode: 'RS-001',
      birthDate: '1988-04-02',
      phone: '06 30 111 2233',
      email: 'Odon@Example.com',
    },
    {
      id: 'g2',
      firstName: 'Anna',
      lastName: 'Kovács',
      barcode: 'RS-002',
      birthDate: null,
      phone: null,
      email: null,
    },
  ];

  it('név és születési dátum (ékezettől és kis-nagybetűtől függetlenül)', () => {
    const result = findIntakeDuplicates(
      { lastName: 'fekete', firstName: 'Odon', birthDate: '1988-04-02' },
      guests,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ guestId: 'g1', matchedOn: ['NAME_AND_BIRTHDATE'] });
  });

  it('eltérő születési dátumnál a név önmagában nem egyezés', () => {
    expect(
      findIntakeDuplicates({ lastName: 'Fekete', firstName: 'Ödön', birthDate: '1990-01-01' }, guests),
    ).toEqual([]);
  });

  it('telefonszám (06 / +36 előtag) és e-mail cím alapján', () => {
    const result = findIntakeDuplicates(
      { lastName: 'Más', firstName: 'Név', phone: '+36 30 111 2233', email: 'odon@example.com ' },
      guests,
    );
    expect(result[0].matchedOn).toEqual(['PHONE', 'EMAIL']);
  });

  it('puszta névegyezés jelez, ha nincs születési dátum; a kizárt vendéget kihagyja', () => {
    expect(findIntakeDuplicates({ lastName: 'Kovács', firstName: 'Anna' }, guests)[0]).toMatchObject(
      { guestId: 'g2', matchedOn: ['NAME'] },
    );
    expect(findIntakeDuplicates({ lastName: 'Kovács', firstName: 'Anna' }, guests, 'g2')).toEqual([]);
  });
});

describe('válaszok olvasható formában', () => {
  const question = (formKey: string, id: string) =>
    form(formKey).questions.find((q) => q.id === id)!;

  it('választásnál a címke, több értéknél vesszővel; elfogadás; üres', () => {
    expect(intakeAnswerText(question('health-questionnaire', 'surgeryLast6Weeks'), 'YES')).toBe('Igen');
    expect(intakeAnswerText(question('health-questionnaire', 'goals'), ['WEIGHT_LOSS', 'FITNESS'])).toBe(
      'Fogyás, Erőnlét, állóképesség',
    );
    expect(intakeAnswerText(question('privacy-notice', 'privacyRead'), 'ACCEPTED')).toBe('Elfogadva');
    expect(intakeAnswerText(question('guest-profile', 'lastName'), undefined)).toBe('—');
    expect(intakeAnswerText(question('guest-profile', 'lastName'), 'Fekete')).toBe('Fekete');
  });
});

describe('profil és mérések', () => {
  it('a profil-űrlap válaszaiból a vendég mezői; ismeretlen nem érték kimarad', () => {
    expect(
      profileFromAnswers(form('guest-profile'), {
        lastName: ' Fekete ',
        firstName: 'Ödön',
        gender: 'ALIEN',
        email: '',
      }),
    ).toEqual({ lastName: 'Fekete', firstName: 'Ödön' });
  });

  it('a mérés csak ismert, véges és határon belüli értéket tart meg', () => {
    expect(
      sanitizeIntakeMeasurements({
        weightKg: '72.5',
        bmi: 24.1,
        bodyFatPct: 140,
        visceralFat: -1,
        calfCm: Number.NaN,
        unknown: 5,
        waistCm: '',
      }),
    ).toEqual({ weightKg: 72.5, bmi: 24.1 });
  });
});
