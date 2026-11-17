import {
  IntakeAnswers,
  IntakeAnswerSet,
  IntakeFormDefinitionDto,
  isHealthForm,
  pruneHiddenAnswers,
} from '@reform/shared';
import { createHash } from 'crypto';

/** Az aláírt dokumentum pillanatképének tartalma (TICKET-56); létrehozás után nem változik. */
export interface IntakeSnapshotContent {
  formKey: string;
  formVersion: number;
  title: string;
  bodyText: string;
  answers: IntakeAnswers;
  signatureDataUrl: string;
  signedAt: Date;
  legalReviewPending: boolean;
}

/** Kulcsrendezett JSON: azonos tartalomra mindig azonos szöveg (és hash). */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** SHA-256 a pillanatkép tartalmi mezőiből; a PDF-be is bekerül ellenőrző kódként. */
export function snapshotContentHash(content: IntakeSnapshotContent): string {
  return createHash('sha256')
    .update(canonicalJson({ ...content, signedAt: content.signedAt.toISOString() }))
    .digest('hex');
}

/** Csak a tartalmi mezőket hash-eli, így a tárolt sor (azonosító, PDF-kulcs …) is ellenőrizhető. */
export function verifySnapshot(row: IntakeSnapshotContent, contentHash: string): boolean {
  const { formKey, formVersion, title, bodyText, answers, signatureDataUrl, signedAt, legalReviewPending } = row;
  const content = { formKey, formVersion, title, bodyText, answers, signatureDataUrl, signedAt, legalReviewPending };
  return snapshotContentHash(content) === contentHash;
}

/**
 * A pillanatképek az aláírandó űrlapokból: a definíció aláíráskori szövege és verziója, a
 * látható kérdések válaszai (az egészségügyiek a külön táblából), a közös aláírás és időbélyeg.
 */
export function buildSnapshots(
  forms: IntakeFormDefinitionDto[],
  answers: IntakeAnswerSet,
  healthAnswers: IntakeAnswerSet,
  signatureDataUrl: string,
  signedAt: Date,
): (IntakeSnapshotContent & { contentHash: string })[] {
  return forms
    .filter((f) => f.requiresSignature)
    .map((form) => {
      const source = isHealthForm(form.kind) ? healthAnswers : answers;
      const content: IntakeSnapshotContent = {
        formKey: form.key,
        formVersion: form.version,
        title: form.title,
        bodyText: form.bodyText,
        answers: pruneHiddenAnswers(form, source[form.key] ?? {}),
        signatureDataUrl,
        signedAt,
        legalReviewPending: form.legalReviewPending,
      };
      return { ...content, contentHash: snapshotContentHash(content) };
    });
}
