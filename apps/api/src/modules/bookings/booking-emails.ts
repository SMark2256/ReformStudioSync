import { escapeHtml, type RenderedEmail } from '../mail/templates/login-code';

/**
 * A foglalási levelek egyszerű, közös sablonja (TICKET-57). A TICKET-55 sablonkezelője
 * később átveheti; addig táblázatos, inline stílusú HTML és sima szöveges változat.
 */

export interface BookingEmailLine {
  treatmentName: string;
  /** „2026. november 20., csütörtök 09:00–09:30” */
  when: string;
}

export interface BookingEmailContent {
  subject: string;
  title: string;
  greetingName: string;
  intro: string;
  lines?: BookingEmailLine[];
  /** Kiemelt adatok (pl. Helyszín, Lemondás). */
  facts?: [label: string, value: string][];
  paragraphs?: string[];
  action?: { label: string; url: string };
}

const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const budapestFormat = new Intl.DateTimeFormat('hu-HU', {
  timeZone: 'Europe/Budapest',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'long',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const timeFormat = new Intl.DateTimeFormat('hu-HU', {
  timeZone: 'Europe/Budapest',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** „2026. november 20., csütörtök 09:00” a stúdió időzónájában. */
export function formatBookingMoment(date: Date): string {
  const parts = budapestFormat.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}. ${get('month')} ${get('day')}., ${get('weekday')} ${get('hour')}:${get('minute')}`;
}

/** „2026. november 20., csütörtök 09:00–09:30” a stúdió időzónájában. */
export function formatBookingWhen(startsAt: Date, endsAt: Date): string {
  return `${formatBookingMoment(startsAt)}–${timeFormat.format(endsAt)}`;
}

export function renderBookingEmail(content: BookingEmailContent): RenderedEmail {
  const lines = content.lines ?? [];
  const facts = content.facts ?? [];
  const paragraphs = content.paragraphs ?? [];

  const lineRows = lines
    .map(
      (l) => `<tr>
                  <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-family:${FONT};font-size:15px;color:#111827;font-weight:600;">${escapeHtml(l.treatmentName)}</td>
                  <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-family:${FONT};font-size:14px;color:#374151;text-align:right;">${escapeHtml(l.when)}</td>
                </tr>`,
    )
    .join('\n');
  const factRows = facts
    .map(
      ([label, value]) => `<p style="margin:0 0 8px;font-family:${FONT};font-size:14px;line-height:1.6;color:#374151;"><strong style="color:#111827;">${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`,
    )
    .join('\n');
  const paragraphHtml = paragraphs
    .map(
      (p) => `<p style="margin:0 0 12px;font-family:${FONT};font-size:14px;line-height:1.6;color:#4b5563;">${escapeHtml(p)}</p>`,
    )
    .join('\n');
  const actionHtml = content.action
    ? `<p style="margin:20px 0 0;"><a href="${escapeHtml(content.action.url)}" style="display:inline-block;background:#0f766e;color:#ffffff;font-family:${FONT};font-size:14px;font-weight:600;text-decoration:none;padding:10px 18px;border-radius:6px;">${escapeHtml(content.action.label)}</a></p>`
    : '';

  const html = `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(content.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f5f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f5f7;">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
          <tr>
            <td style="padding:0 4px 16px;font-family:${FONT};font-size:15px;font-weight:600;color:#111827;">Re-Form Stúdió</td>
          </tr>
          <tr>
            <td style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:32px;">
              <h1 style="margin:0 0 12px;font-family:${FONT};font-size:20px;line-height:1.3;font-weight:600;color:#111827;">${escapeHtml(content.title)}</h1>
              <p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.6;color:#374151;">Kedves ${escapeHtml(content.greetingName)}! ${escapeHtml(content.intro)}</p>
              ${lines.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">${lineRows}</table>` : ''}
              ${factRows}
              ${paragraphHtml}
              ${actionHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 4px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:#6b7280;text-align:center;">Ezt a levelet a Re-Form Stúdió foglalási rendszere küldte automatikusan.</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  const text = [
    `Kedves ${content.greetingName}!`,
    '',
    content.intro,
    '',
    ...lines.map((l) => `- ${l.treatmentName}: ${l.when}`),
    ...(lines.length ? [''] : []),
    ...facts.map(([label, value]) => `${label}: ${value}`),
    ...(facts.length ? [''] : []),
    ...paragraphs.flatMap((p) => [p, '']),
    ...(content.action ? [`${content.action.label}: ${content.action.url}`, ''] : []),
    '--',
    'Ezt a levelet a Re-Form Stúdió foglalási rendszere küldte automatikusan.',
    '',
  ].join('\n');

  return { subject: content.subject, html, text };
}
