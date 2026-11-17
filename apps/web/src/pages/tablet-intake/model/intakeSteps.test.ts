import { BUILT_IN_INTAKE_FORMS } from '@reform/shared';
import { describe, expect, it } from 'vitest';
import { buildIntakeSteps, firstIncompleteStepIndex, signedDocumentTitles } from './intakeSteps';

const forms = (...keys: string[]) =>
  keys.map((key) => BUILT_IN_INTAKE_FORMS.find((f) => f.key === key)!);

const stepNames = (steps: ReturnType<typeof buildIntakeSteps>) =>
  steps.map((s) => (s.kind === 'form' ? s.form.key : s.kind));

describe('vendégmód lépései (TICKET-56)', () => {
  it('a profilkép a személyes adatok után, az aláírás a végén; sorrend az order szerint', () => {
    const steps = buildIntakeSteps(forms('marketing-consent', 'guest-profile', 'privacy-notice'));
    expect(stepNames(steps)).toEqual([
      'privacy-notice',
      'guest-profile',
      'photo',
      'marketing-consent',
      'sign',
    ]);
  });

  it('profil nélkül (meglévő vendég) nincs fotólépés', () => {
    expect(stepNames(buildIntakeSteps(forms('hypoxi-informed-consent')))).toEqual([
      'hypoxi-informed-consent',
      'sign',
    ]);
  });

  it('folytatáskor az első hiányos űrlapnál kezd, teljes kitöltésnél az aláírásnál', () => {
    const steps = buildIntakeSteps(forms('privacy-notice', 'guest-profile', 'marketing-consent'));
    expect(firstIncompleteStepIndex(steps, {})).toBe(0);
    expect(
      firstIncompleteStepIndex(steps, {
        'privacy-notice': { privacyRead: 'ACCEPTED' },
      }),
    ).toBe(1);
    expect(
      firstIncompleteStepIndex(steps, {
        'privacy-notice': { privacyRead: 'ACCEPTED' },
        'guest-profile': {
          lastName: 'Fekete',
          firstName: 'Ödön',
          birthDate: '1988-04-02',
          phone: '+36 30 111 2233',
          email: 'odon@example.com',
          gender: 'MALE',
        },
        'marketing-consent': { marketingPhotoVideo: 'NO', marketingMessages: 'NO' },
      }),
    ).toBe(steps.length - 1);
  });

  it('az aláírandó dokumentumok címei (a profil nem az)', () => {
    expect(signedDocumentTitles(forms('privacy-notice', 'guest-profile'))).toEqual([
      'Adatkezelési tájékoztató',
    ]);
  });
});
