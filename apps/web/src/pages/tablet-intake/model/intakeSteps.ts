import {
  IntakeAnswerSet,
  IntakeFormDefinitionDto,
  missingRequiredAnswers,
} from '@reform/shared';

/** A vendégmód lépései: az űrlapok sorrendben, a profilkép, végül az aláírás. */
export type IntakeStep =
  | { kind: 'form'; form: IntakeFormDefinitionDto }
  | { kind: 'photo' }
  | { kind: 'sign' };

/**
 * A profilkép a személyes adatok után következik (meglévő vendégnél, ha a profilt nem kérjük
 * újra, nincs fotólépés: a profilképe már megvan). Az aláírás mindig az utolsó lépés.
 */
export function buildIntakeSteps(forms: IntakeFormDefinitionDto[]): IntakeStep[] {
  const ordered = [...forms].sort((a, b) => a.order - b.order);
  const steps: IntakeStep[] = [];
  for (const form of ordered) {
    steps.push({ kind: 'form', form });
    if (form.kind === 'PROFILE') steps.push({ kind: 'photo' });
  }
  steps.push({ kind: 'sign' });
  return steps;
}

/** Folytatáskor az első lépés, amelynek kötelező válasza hiányzik (különben az aláírás). */
export function firstIncompleteStepIndex(steps: IntakeStep[], answers: IntakeAnswerSet): number {
  const index = steps.findIndex(
    (step) =>
      step.kind === 'form' &&
      missingRequiredAnswers(step.form, answers[step.form.key] ?? {}).length > 0,
  );
  return index === -1 ? steps.length - 1 : index;
}

/** Az aláírással elfogadott dokumentumok címei (az aláírás lépésen felsorolva). */
export function signedDocumentTitles(forms: IntakeFormDefinitionDto[]): string[] {
  return forms.filter((f) => f.requiresSignature).map((f) => f.title);
}
