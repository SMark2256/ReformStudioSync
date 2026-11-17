import { BUILT_IN_INTAKE_FORMS } from '@reform/shared';
import { describe, expect, it } from 'vitest';
import { answerText } from './answerText';

const question = (formKey: string, id: string) =>
  BUILT_IN_INTAKE_FORMS.find((f) => f.key === formKey)!.questions.find((q) => q.id === id)!;

describe('answerText (TICKET-56)', () => {
  it('választásnál a címke, több értéknél vesszővel', () => {
    expect(answerText(question('health-questionnaire', 'surgeryLast6Weeks'), 'YES')).toBe('Igen');
    expect(answerText(question('health-questionnaire', 'goals'), ['WEIGHT_LOSS', 'FITNESS'])).toBe(
      'Fogyás, Erőnlét, állóképesség',
    );
  });

  it('elfogadás, üres és szabad szöveges válasz', () => {
    expect(answerText(question('privacy-notice', 'privacyRead'), 'ACCEPTED')).toBe('Elfogadva');
    expect(answerText(question('guest-profile', 'lastName'), undefined)).toBe('—');
    expect(answerText(question('guest-profile', 'lastName'), 'Fekete')).toBe('Fekete');
  });
});
