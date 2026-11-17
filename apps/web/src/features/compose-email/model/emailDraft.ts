import {
  EmailPlaceholderValues,
  fillPlaceholders,
  findUnknownPlaceholders,
  renderEmailDocument,
  SAMPLE_PLACEHOLDER_VALUES,
} from '@reform/shared';

// A levélszerkesztő tiszta logikája (TICKET-55): hivatkozás és kép címének ellenőrzése, az élő
// előnézet. A végleges szanitizálás a szerveren történik.

export interface EmailDraft {
  subject: string;
  bodyHtml: string;
}

export const EMPTY_DRAFT: EmailDraft = { subject: '', bodyHtml: '' };

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function parseWebUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(HAS_SCHEME.test(value) ? value : `https://${value}`);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Hivatkozás: webcím (séma nélkül `https://`) vagy `mailto:`; minden más (pl. `javascript:`) tilos. */
export function normalizeLinkUrl(raw: string): string | null {
  const value = raw.trim();
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(value)) return value;
  return parseWebUrl(value);
}

/** Kép: csak webcímről (a fájlfeltöltés a TICKET-56 tárolójára vár). */
export function normalizeImageUrl(raw: string): string | null {
  return parseWebUrl(raw);
}

/** Van-e tárgy és szöveg vagy kép (a mentés és a küldés feltétele, mint az API-n). */
export function draftHasContent(draft: EmailDraft): boolean {
  if (!draft.subject.trim()) return false;
  const text = draft.bodyHtml
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  return text.length > 0 || /<img\b[^>]*\ssrc=/i.test(draft.bodyHtml);
}

/** Az elírt mezőnevek a tárgyban és a szövegben. */
export const unknownPlaceholdersIn = (draft: EmailDraft): string[] =>
  findUnknownPlaceholders(`${draft.subject}\n${draft.bodyHtml}`);

/** Az élő előnézet: kitöltött mezők, a teljes levélkeret (marketingnél leiratkozó lábléccel). */
export function renderDraftPreview(
  draft: EmailDraft,
  options: { values?: EmailPlaceholderValues; marketing?: boolean } = {},
): { subject: string; html: string } {
  const values = options.values ?? SAMPLE_PLACEHOLDER_VALUES;
  const subject = fillPlaceholders(draft.subject, values, { html: false });
  return {
    subject,
    html: renderEmailDocument({
      subject,
      bodyHtml: fillPlaceholders(draft.bodyHtml, values, { html: true }),
      unsubscribeUrl: options.marketing ? '#leiratkozas' : null,
    }),
  };
}
