import {
  appError,
  EMAIL_BODY_MAX_LENGTH,
  EmailPlaceholderValues,
  fillPlaceholders,
  renderEmailDocument,
} from '@reform/shared';
import sanitizeHtml from 'sanitize-html';
import type { RenderedEmail } from '../mail/templates/login-code';

/**
 * A sablon és az egyéni levél HTML-je a szerkesztőből jön: mentés és küldés előtt csak az
 * engedélyezett jelölés marad (formázás, lista, link, kép URL-lel). Script, stíluslap, eseménykezelő,
 * `javascript:` és `data:` URL nem.
 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's',
    'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'hr', 'a', 'img',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height'],
    '*': ['style'],
  },
  allowedStyles: {
    '*': { 'text-align': [/^(left|right|center|justify)$/] },
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['https', 'http'] },
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
  },
  // A tiltott forrású (pl. `data:`) kép `src` nélkül maradna: az egész elem kikerül.
  exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs.src,
};

export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS).trim();
}

/** Van-e látható tartalom (szöveg vagy kép) a szanitizált törzsben. */
export function hasVisibleContent(html: string): boolean {
  return /<img\b[^>]*\ssrc=/i.test(html) || htmlToText(html).length > 0;
}

/** Mentés előtti ellenőrzés: üres tárgy / törzs és túl hosszú törzs nem megy át. */
export function cleanEmailContent(input: { subject: string; bodyHtml: string }): {
  subject: string;
  bodyHtml: string;
} {
  const subject = input.subject.replace(/\s+/g, ' ').trim();
  const bodyHtml = sanitizeEmailHtml(input.bodyHtml.slice(0, EMAIL_BODY_MAX_LENGTH));
  if (!subject || !hasVisibleContent(bodyHtml)) throw appError('MAIL.EMPTY_CONTENT');
  return { subject, bodyHtml };
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  nbsp: ' ',
};

/** Szöveges változat a levélhez (a szanitizált HTML-ből; nem biztonsági határ). */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, (_m, href: string, label: string) =>
      label.replace(/<[^>]+>/g, '').trim() === href ? href : `${label} (${href})`,
    )
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<\/(p|div|h[1-3]|li|blockquote|ul|ol)>/gi, '\n')
    .replace(/<hr\b[^>]*>/gi, '\n---\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_m, name: string) => ENTITIES[name])
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface BuildEmailParams {
  subject: string;
  /** Szanitizált törzs, még kitöltetlen `{{mezo}}` helyőrzőkkel. */
  bodyHtml: string;
  values: EmailPlaceholderValues;
  /** Marketing levélnél a vendég saját leiratkozó linkje. */
  unsubscribeUrl?: string | null;
}

/** A kész levél: kitöltött mezők (a HTML-ben escape-elve), keret, szöveges változat. */
export function buildEmail(params: BuildEmailParams): RenderedEmail {
  const subject = fillPlaceholders(params.subject, params.values, { html: false });
  const body = fillPlaceholders(params.bodyHtml, params.values, { html: true });
  const html = renderEmailDocument({
    subject,
    bodyHtml: body,
    studioName: params.values.studio_nev,
    unsubscribeUrl: params.unsubscribeUrl,
  });
  const footer = params.unsubscribeUrl
    ? `Leiratkozás a hírlevelekről és ajánlatokról: ${params.unsubscribeUrl}`
    : `Ezt a levelet a ${params.values.studio_nev} küldte.`;
  const text = `${htmlToText(body)}\n\n--\n${footer}\n`;
  return { subject, html, text };
}
