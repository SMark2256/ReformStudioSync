import { IntakeAnswerValue, IntakeQuestion } from '@reform/shared';

/** Egy válasz olvasható formában (a választható értékek a címkéjükkel). */
export function answerText(question: IntakeQuestion, value: IntakeAnswerValue | undefined): string {
  if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
    return '—';
  }
  if (question.type === 'ACCEPT') return value === 'ACCEPTED' ? 'Elfogadva' : 'Nem fogadta el';
  const labels = new Map((question.options ?? []).map((o) => [o.value, o.label]));
  return (Array.isArray(value) ? value : [value]).map((v) => labels.get(v) ?? v).join(', ');
}
