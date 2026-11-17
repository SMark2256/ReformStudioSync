import {
  AuthUserDto,
  INTAKE_PACKAGE_CIRCUIT,
  INTAKE_PACKAGE_HYPOXI,
  IntakeAnswerSet,
  IntakeStatus,
  Role,
} from '@reform/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockStudioEngine } from './mock-engine';
import { mockIntakeEngine } from './mock-intake';

const errorOf = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return null;
};

const staff: AuthUserDto = {
  id: 'staff-1',
  studioId: 'default-studio',
  email: 'reka@reformstudio.hu',
  name: 'Kiss Réka',
  role: Role.RECEPTIONIST,
};

const SIGNATURE = 'data:image/png;base64,iVBORw0KGgo=';

/** A köredzés csomag hiánytalan válaszai (új vendég). */
const CIRCUIT_ANSWERS: IntakeAnswerSet = {
  'privacy-notice': { privacyRead: 'ACCEPTED' },
  'guest-profile': {
    lastName: 'Fekete',
    firstName: 'Ödön',
    birthDate: '1988-04-02',
    phone: '+36 70 999 1234',
    email: 'odon@example.com',
    gender: 'MALE',
  },
  'health-data-consent': { healthConsent: 'ACCEPTED' },
  'health-questionnaire': {
    surgeryLast6Weeks: 'YES',
    labLast6Months: 'NO',
    goals: ['FITNESS'],
    fluidIntake: '1_2L',
    workType: 'SEDENTARY',
  },
  'circuit-contraindications': {
    cardiovascular: 'NO',
    uncontrolledBloodPressure: 'NO',
    jointOrSpine: 'NO',
    pregnancy: 'NO',
  },
  'circuit-membership-contract': { membershipTerm: '3', termsAccepted: 'ACCEPTED' },
  'marketing-consent': { marketingPhotoVideo: 'NO', marketingMessages: 'YES' },
};

const prepareNewGuest = () =>
  mockIntakeEngine.createSession(
    {
      newGuest: { lastName: 'Fekete', firstName: 'Ödön' },
      packageKeys: [INTAKE_PACKAGE_CIRCUIT],
      source: 'PC',
    },
    staff,
  );

/** A vendég a tableten végigtölti és aláírja. */
const fillAndSubmit = (token: string, answers: IntakeAnswerSet = CIRCUIT_ANSWERS) => {
  const view = mockIntakeEngine.getGuestView(token);
  for (const form of view.forms) {
    mockIntakeEngine.saveGuestAnswers(token, form.key, answers[form.key] ?? {});
  }
  return mockIntakeEngine.submitGuest(token, SIGNATURE);
};

const pairTablet = (name = 'Recepciós tablet') => {
  const device = mockStudioEngine.initDisplayPairing(name, 'TABLET');
  return mockStudioEngine.verifyDisplayPairing(device.pairingCode!);
};

describe('mock-engine — tabletes vendégfelvétel (TICKET-56)', () => {
  beforeEach(() => {
    localStorage.clear();
    mockStudioEngine.resetDatabase();
    mockIntakeEngine.reset();
  });

  it('új vendég: a közös és a köredzés űrlapjait kéri, előkészítve', () => {
    const detail = prepareNewGuest();
    expect(detail.status).toBe(IntakeStatus.PREPARED);
    expect(detail.forms.map((f) => f.key)).toEqual([
      'privacy-notice',
      'guest-profile',
      'health-data-consent',
      'health-questionnaire',
      'circuit-contraindications',
      'circuit-membership-contract',
      'marketing-consent',
    ]);
  });

  it('duplikátumnál figyelmeztet, megerősítés után létrehozza', () => {
    const input = {
      newGuest: { lastName: 'Más', firstName: 'Valaki', phone: '06 30 412 8891' },
      packageKeys: [INTAKE_PACKAGE_CIRCUIT],
      source: 'PC' as const,
    };
    const err = errorOf(() => mockIntakeEngine.createSession(input, staff)) as {
      code: string;
      details: { duplicates: { guestId: string; matchedOn: string[] }[] };
    };
    expect(err.code).toBe('INTAKE.DUPLICATE_SUSPECTED');
    expect(err.details.duplicates[0]).toMatchObject({ guestId: 'guest-1', matchedOn: ['PHONE'] });

    const created = mockIntakeEngine.createSession({ ...input, acknowledgeDuplicates: true }, staff);
    expect(created.duplicates.map((d) => d.guestId)).toContain('guest-1');
  });

  it('vendégmód: token nélkül vagy más tokennel nem érhető el; a vendég csak a saját kitöltését látja', () => {
    const first = prepareNewGuest();
    const second = mockIntakeEngine.createSession(
      { guestId: 'guest-1', packageKeys: [INTAKE_PACKAGE_HYPOXI], source: 'PC' },
      staff,
    );
    const { guestToken } = mockIntakeEngine.startGuestMode(first.id, staff);

    expect(mockIntakeEngine.getGuestView(guestToken).sessionId).toBe(first.id);
    expect(errorOf(() => mockIntakeEngine.getGuestView(null))).toMatchObject({
      code: 'INTAKE.GUEST_TOKEN_INVALID',
    });
    expect(errorOf(() => mockIntakeEngine.getGuestView('hamis'))).toMatchObject({
      code: 'INTAKE.GUEST_TOKEN_INVALID',
    });
    expect(JSON.stringify(mockIntakeEngine.getGuestView(guestToken))).not.toContain(second.id);
  });

  it('egészségügyi válasz csak a hozzájárulás után, és külön tárolva', () => {
    const detail = prepareNewGuest();
    const { guestToken } = mockIntakeEngine.startGuestMode(detail.id, staff);
    const health = CIRCUIT_ANSWERS['health-questionnaire'];

    expect(
      errorOf(() => mockIntakeEngine.saveGuestAnswers(guestToken, 'health-questionnaire', health)),
    ).toMatchObject({ code: 'INTAKE.ANSWERS_INCOMPLETE' });

    mockIntakeEngine.saveGuestAnswers(guestToken, 'health-data-consent', { healthConsent: 'ACCEPTED' });
    const { warnings } = mockIntakeEngine.saveGuestAnswers(guestToken, 'health-questionnaire', health);
    expect(warnings.map((w) => w.questionId)).toEqual(['surgeryLast6Weeks']);

    const reviewed = mockIntakeEngine.getDetail(detail.id);
    expect(reviewed.status).toBe(IntakeStatus.GUEST_FILLING);
    expect(reviewed.answers['health-questionnaire']).toBeUndefined();

    const auditBefore = mockIntakeEngine.getState().auditLog.length;
    expect(mockIntakeEngine.getHealth(detail.id, staff).answers['health-questionnaire']).toEqual(health);
    expect(mockIntakeEngine.getState().auditLog[0]).toMatchObject({ action: 'HEALTH_DATA_READ' });
    expect(mockIntakeEngine.getState().auditLog.length).toBe(auditBefore + 1);
  });

  it('hiányos beküldés: a hiányzó kérdéseket adja vissza', () => {
    const detail = prepareNewGuest();
    const { guestToken } = mockIntakeEngine.startGuestMode(detail.id, staff);
    const err = errorOf(() => mockIntakeEngine.submitGuest(guestToken, SIGNATURE)) as {
      code: string;
      details: { missing: { formKey: string }[] };
    };
    expect(err.code).toBe('INTAKE.ANSWERS_INCOMPLETE');
    expect(err.details.missing.map((m) => m.formKey)).toContain('privacy-notice');
  });

  it('teljes folyamat: kitöltés, aláírás, jóváhagyás → vendég, mérés, PDF a profilon', () => {
    const detail = prepareNewGuest();
    mockIntakeEngine.updateSession(detail.id, { measurements: { weightKg: 82.4, bmi: 26.1, calfCm: 38 } }, staff);
    const { guestToken } = mockIntakeEngine.startGuestMode(detail.id, staff);
    mockIntakeEngine.saveGuestPhoto(guestToken, 'data:image/webp;base64,UklGRg==');
    expect(fillAndSubmit(guestToken).status).toBe(IntakeStatus.AWAITING_REVIEW);

    const approved = mockIntakeEngine.approve(detail.id, staff);
    expect(approved.status).toBe(IntakeStatus.COMPLETED);
    expect(approved.guestId).toBeTruthy();

    const guest = mockStudioEngine.getGuestById(approved.guestId!);
    expect(guest).toMatchObject({ lastName: 'Fekete', firstName: 'Ödön', email: 'odon@example.com' });
    expect(guest.measurements?.[0]).toMatchObject({ weightKg: 82.4, bmi: 26.1, calfCm: 38, intakeSessionId: detail.id });
    expect(guest.photos?.[0]).toMatchObject({ purpose: 'PROFILE' });

    const documents = mockIntakeEngine.listGuestDocuments(guest.id);
    expect(documents.map((d) => d.formKey)).toEqual(
      expect.arrayContaining(['privacy-notice', 'health-questionnaire', 'circuit-membership-contract']),
    );
    // A profil-űrlap nem aláírandó dokumentum.
    expect(documents.map((d) => d.formKey)).not.toContain('guest-profile');
    expect(mockIntakeEngine.documentLink(documents[0].id, staff).url).toMatch(/^data:application\/pdf;base64,/);
    expect(mockIntakeEngine.sendDocumentEmail(documents[0].id, staff)).toEqual({ sent: true });

    // A lezárt kitöltés tokenje már nem él.
    expect(errorOf(() => mockIntakeEngine.getGuestView(guestToken))).toMatchObject({
      code: 'INTAKE.GUEST_TOKEN_INVALID',
    });
  });

  it('meglévő vendégnél csak a hiányzó dokumentumokat kéri, majd ha minden megvan, nem indítható', () => {
    const first = mockIntakeEngine.createSession(
      { guestId: 'guest-1', packageKeys: [INTAKE_PACKAGE_CIRCUIT], source: 'PC' },
      staff,
    );
    const { guestToken } = mockIntakeEngine.startGuestMode(first.id, staff);
    fillAndSubmit(guestToken);
    mockIntakeEngine.approve(first.id, staff);

    const second = mockIntakeEngine.createSession(
      { guestId: 'guest-1', packageKeys: [INTAKE_PACKAGE_CIRCUIT, INTAKE_PACKAGE_HYPOXI], source: 'TABLET' },
      staff,
    );
    expect(second.forms.map((f) => f.key)).toEqual(['hypoxi-contraindications', 'hypoxi-informed-consent']);

    expect(
      errorOf(() =>
        mockIntakeEngine.createSession(
          { guestId: 'guest-1', packageKeys: [INTAKE_PACKAGE_CIRCUIT], source: 'PC' },
          staff,
        ),
      ),
    ).toMatchObject({ code: 'INTAKE.NOTHING_MISSING' });
  });

  it('jóváhagyás csak ellenőrzésre váró kitöltésből; visszaküldésnél új aláírás kell', () => {
    const detail = prepareNewGuest();
    expect(errorOf(() => mockIntakeEngine.approve(detail.id, staff))).toMatchObject({
      code: 'INTAKE.INVALID_TRANSITION',
    });
    const { guestToken } = mockIntakeEngine.startGuestMode(detail.id, staff);
    fillAndSubmit(guestToken);
    const returned = mockIntakeEngine.returnToGuest(detail.id, staff);
    expect(returned.status).toBe(IntakeStatus.GUEST_FILLING);
    expect(returned.signatureDataUrl).toBeNull();
  });

  it('PC → tablet: csak párosított tabletre; a tablet átveszi, kilépés csak a kóddal', () => {
    const detail = prepareNewGuest();
    const monitor = mockStudioEngine.initDisplayPairing('Vendégmonitor');
    mockStudioEngine.verifyDisplayPairing(monitor.pairingCode!);
    expect(errorOf(() => mockIntakeEngine.sendToDevice(detail.id, monitor.id, staff))).toMatchObject({
      code: 'INTAKE.DEVICE_NOT_TABLET',
    });

    const tablet = pairTablet();
    expect(mockIntakeEngine.claimForDevice(tablet.deviceToken)).toBeNull();
    const sent = mockIntakeEngine.sendToDevice(detail.id, tablet.device.id, staff);
    expect(mockIntakeEngine.getDetail(detail.id).assignedDeviceName).toBe('Recepciós tablet');

    const assignment = mockIntakeEngine.claimForDevice(tablet.deviceToken)!;
    expect(assignment.sessionId).toBe(detail.id);

    expect(errorOf(() => mockIntakeEngine.exitGuestMode(assignment.guestToken, '000000'))).toMatchObject({
      code: 'INTAKE.EXIT_CODE_INVALID',
    });
    // Párosított tabletről indult: nincs munkatársi munkamenet, a tablet várakozni kezd.
    expect(mockIntakeEngine.exitGuestMode(assignment.guestToken, sent.exitCode)).toEqual({ released: true });
    expect(errorOf(() => mockIntakeEngine.getGuestView(assignment.guestToken))).toMatchObject({
      code: 'INTAKE.GUEST_TOKEN_INVALID',
    });
  });

  it('ezen az eszközön indított vendégmódból a helyes kód a munkatárs munkamenetét adja vissza', () => {
    const detail = prepareNewGuest();
    const { guestToken, exitCode } = mockIntakeEngine.startGuestMode(detail.id, staff);
    const result = mockIntakeEngine.exitGuestMode(guestToken, exitCode);
    expect(result.staff?.user).toMatchObject({ id: staff.id });
  });

  it('sok hibás kilépési kód után zárol', () => {
    const detail = prepareNewGuest();
    const { guestToken, exitCode } = mockIntakeEngine.startGuestMode(detail.id, staff);
    for (let i = 0; i < 5; i += 1) {
      expect(errorOf(() => mockIntakeEngine.exitGuestMode(guestToken, 'rossz'))).toMatchObject({
        code: 'INTAKE.EXIT_CODE_INVALID',
      });
    }
    expect(errorOf(() => mockIntakeEngine.exitGuestMode(guestToken, exitCode))).toMatchObject({
      code: 'INTAKE.EXIT_LOCKED',
    });
  });

  it('a megszakított kitöltés nem folytatható', () => {
    const detail = prepareNewGuest();
    const { guestToken } = mockIntakeEngine.startGuestMode(detail.id, staff);
    expect(mockIntakeEngine.cancel(detail.id, staff).status).toBe(IntakeStatus.CANCELLED);
    expect(errorOf(() => mockIntakeEngine.getGuestView(guestToken))).toMatchObject({
      code: 'INTAKE.GUEST_TOKEN_INVALID',
    });
    expect(errorOf(() => mockIntakeEngine.cancel(detail.id, staff))).toMatchObject({
      code: 'INTAKE.INVALID_TRANSITION',
    });
  });
});
