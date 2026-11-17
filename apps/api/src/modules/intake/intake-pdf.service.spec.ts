import { BUILT_IN_INTAKE_FORMS, INTAKE_LEGAL_REVIEW_LABEL } from '@reform/shared';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { IntakePdfInput, IntakePdfService } from './intake-pdf.service';

const SIGNATURE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const health = BUILT_IN_INTAKE_FORMS.find((f) => f.key === 'health-questionnaire')!;

const input = (overrides: Partial<IntakePdfInput> = {}): IntakePdfInput => ({
  title: health.title,
  formKey: health.key,
  formVersion: health.version,
  bodyText: `${health.bodyText}\n\nÁrvíztűrő tükörfúrógép – őŐűŰ.`,
  questions: health.questions,
  answers: {
    surgeryLast6Weeks: 'NO',
    labLast6Months: 'YES',
    cholesterolTotal: 'HIGH',
    goals: ['WEIGHT_LOSS', 'FITNESS'],
    fluidIntake: '1_2L',
    workType: 'SEDENTARY',
  },
  signatureDataUrl: SIGNATURE,
  signedAt: new Date('2026-11-17T09:30:00Z'),
  legalReviewPending: true,
  guestName: 'Fekete Ödön',
  contentHash: 'a'.repeat(64),
  ...overrides,
});

describe('IntakePdfService — szerveroldali PDF (TICKET-56)', () => {
  const service = new IntakePdfService();

  // A szabványos (WinAnsi) betűkkel az „ő” és „ű” kivételt dobna: a sikeres render a beágyazott
  // Noto Sanst is igazolja.
  it('érvényes PDF ékezetes szöveggel, verzióval és aláírással', async () => {
    const bytes = await service.render(input());
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(pdf.getTitle()).toBe('Egészségügyi kérdőív – Fekete Ödön');
    expect(pdf.getSubject()).toBe('health-questionnaire v1');
    expect(pdf.getCreationDate()?.toISOString()).toBe('2026-11-17T09:30:00.000Z');
  });

  it('hosszú szövegnél új oldalt kezd, és nem olvasható aláírásnál sem hibázik', async () => {
    const long = Array.from({ length: 120 }, (_, i) => `${i + 1}. bekezdés: ${INTAKE_LEGAL_REVIEW_LABEL}.`).join(
      '\n\n',
    );
    const bytes = await service.render(input({ bodyText: long, signatureDataUrl: 'nem-kep' }));
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });
});
