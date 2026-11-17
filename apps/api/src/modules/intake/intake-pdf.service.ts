import * as fontkit from '@pdf-lib/fontkit';
import { Injectable } from '@nestjs/common';
import {
  IntakeAnswers,
  IntakeFormDefinitionDto,
  INTAKE_LEGAL_REVIEW_LABEL,
  intakeAnswerText,
  isQuestionVisible,
} from '@reform/shared';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';

/** A PDF-be kerülő, aláírt dokumentum (a pillanatkép tartalma). */
export interface IntakePdfInput {
  title: string;
  formKey: string;
  formVersion: number;
  bodyText: string;
  questions: IntakeFormDefinitionDto['questions'];
  answers: IntakeAnswers;
  signatureDataUrl: string;
  signedAt: Date;
  legalReviewPending: boolean;
  guestName: string;
  contentHash: string;
}

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const TEXT_COLOR = rgb(0.11, 0.13, 0.17);
const MUTED_COLOR = rgb(0.33, 0.38, 0.44);

const FONT_FILES = { regular: 'NotoSans-Regular.ttf', bold: 'NotoSans-Bold.ttf' } as const;

/** A betűkészlet helye: `apps/api/assets/fonts` (a forrásból és a buildből is megtalálja). */
function readFont(file: string): Buffer {
  const candidates = [
    join(process.cwd(), 'assets', 'fonts', file),
    join(process.cwd(), 'apps', 'api', 'assets', 'fonts', file),
    join(__dirname, '..', '..', '..', 'assets', 'fonts', file),
    join(__dirname, '..', '..', '..', '..', 'assets', 'fonts', file),
  ];
  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error(`Hiányzó betűkészlet: ${file}`);
  return readFileSync(found);
}

const formatHuDateTime = (date: Date) =>
  date.toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' });

/**
 * Szerveroldali PDF (TICKET-56): pdf-lib + fontkit, beágyazott (részhalmazolt) Noto Sans, így
 * az ékezetes betűk (ő, ű) is helyesek. Tartalmazza a dokumentum szövegét, verzióját, a
 * válaszokat, az aláírást és az aláírás időpontját.
 */
@Injectable()
export class IntakePdfService {
  private fonts?: { regular: Buffer; bold: Buffer };

  private loadFonts() {
    this.fonts ??= { regular: readFont(FONT_FILES.regular), bold: readFont(FONT_FILES.bold) };
    return this.fonts;
  }

  async render(input: IntakePdfInput): Promise<Buffer> {
    const fonts = this.loadFonts();
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    pdf.setTitle(`${input.title} – ${input.guestName}`);
    pdf.setAuthor('Re-Form Stúdió');
    pdf.setSubject(`${input.formKey} v${input.formVersion}`);
    pdf.setCreationDate(input.signedAt);
    const regular = await pdf.embedFont(fonts.regular, { subset: true });
    const bold = await pdf.embedFont(fonts.bold, { subset: true });

    const writer = new PdfWriter(pdf, regular, bold);
    writer.heading(input.title);
    writer.line(`Vendég: ${input.guestName}`, { color: MUTED_COLOR });
    writer.line(`Dokumentum: ${input.formKey}, verzió: ${input.formVersion}`, { color: MUTED_COLOR });
    writer.line(`Aláírva: ${formatHuDateTime(input.signedAt)}`, { color: MUTED_COLOR });
    if (input.legalReviewPending) {
      writer.line(INTAKE_LEGAL_REVIEW_LABEL, { font: bold });
    }
    writer.gap();
    for (const paragraph of input.bodyText.split(/\n{2,}/)) {
      writer.paragraph(paragraph.replace(/\n/g, ' '));
    }

    const answered = input.questions.filter((q) => isQuestionVisible(q, input.answers));
    if (answered.length > 0) {
      writer.gap();
      writer.subheading('Válaszok');
      for (const q of answered) {
        writer.paragraph(q.label, { font: bold, after: 2 });
        writer.paragraph(intakeAnswerText(q, input.answers[q.id]), { indent: 12 });
      }
    }

    writer.gap();
    writer.subheading('Aláírás');
    await writer.signature(input.signatureDataUrl);
    writer.line(`Időbélyeg: ${input.signedAt.toISOString()}`, { color: MUTED_COLOR, size: 9 });
    writer.line(`Ellenőrző kód (SHA-256): ${input.contentHash}`, { color: MUTED_COLOR, size: 8 });

    return Buffer.from(await pdf.save());
  }
}

interface WriteOptions {
  font?: PDFFont;
  size?: number;
  color?: ReturnType<typeof rgb>;
  indent?: number;
  after?: number;
}

/** Egyszerű, lapozó szövegíró: sortörés szóhatáron, új oldal, ha nem fér ki. */
class PdfWriter {
  private page: PDFPage;
  private y = PAGE_HEIGHT - MARGIN;

  constructor(
    private readonly pdf: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
  ) {
    this.page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  }

  heading(text: string) {
    this.paragraph(text, { font: this.bold, size: 16, after: 8 });
  }

  subheading(text: string) {
    this.paragraph(text, { font: this.bold, size: 12, after: 6 });
  }

  line(text: string, options: WriteOptions = {}) {
    this.paragraph(text, { size: 10, after: 2, ...options });
  }

  gap() {
    this.y -= 10;
  }

  paragraph(text: string, options: WriteOptions = {}) {
    const font = options.font ?? this.regular;
    const size = options.size ?? 10.5;
    const indent = options.indent ?? 0;
    const lineHeight = size * 1.4;
    const maxWidth = PAGE_WIDTH - 2 * MARGIN - indent;
    for (const line of wrap(text, font, size, maxWidth)) {
      this.ensureSpace(lineHeight);
      this.page.drawText(line, {
        x: MARGIN + indent,
        y: this.y - size,
        size,
        font,
        color: options.color ?? TEXT_COLOR,
      });
      this.y -= lineHeight;
    }
    this.y -= options.after ?? 6;
  }

  async signature(dataUrl: string) {
    const match = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(dataUrl);
    if (!match) {
      this.line('(Az aláírás képe nem olvasható.)');
      return;
    }
    const bytes = Buffer.from(match[2], 'base64');
    const image =
      match[1] === 'png' ? await this.pdf.embedPng(bytes) : await this.pdf.embedJpg(bytes);
    const width = Math.min(240, image.width);
    const height = (image.height / image.width) * width;
    this.ensureSpace(height + 8);
    this.page.drawImage(image, { x: MARGIN, y: this.y - height, width, height });
    this.y -= height + 8;
  }

  private ensureSpace(height: number) {
    if (this.y - height >= MARGIN) return;
    this.page = this.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
  }
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}
