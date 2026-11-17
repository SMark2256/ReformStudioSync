import { escapeHtml, firstNameOf, formatRequestedAt, RenderedEmail } from './login-code';

/**
 * Az aláírt felvételi dokumentum levele (TICKET-56): egyszerű saját sablon, a PDF csatolmányban.
 * A TICKET-55 sablonkezelője később átveheti.
 */
export interface IntakeDocumentEmailParams {
  guestName: string;
  documentTitle: string;
  signedAt: Date;
}

export function renderIntakeDocumentEmail(params: IntakeDocumentEmailParams): RenderedEmail {
  const name = firstNameOf(params.guestName);
  const signedAt = formatRequestedAt(params.signedAt);
  const subject = `${params.documentTitle} – Re-Form Stúdió`;
  const text = [
    `Kedves ${name}!`,
    '',
    `Csatoltan küldjük a(z) „${params.documentTitle}” dokumentumot, amelyet ${signedAt} időpontban írtál alá a Re-Form Stúdióban.`,
    '',
    'Ha kérdésed van, válaszolj erre a levélre, vagy keress minket a recepción.',
    '',
    'Üdvözlettel:',
    'Re-Form Stúdió',
  ].join('\n');
  const html = `<!doctype html>
<html lang="hu">
<body style="margin:0;padding:24px;background:#f5f6f8;font-family:'Segoe UI',Arial,sans-serif;color:#1b222c;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dde1e7;border-radius:8px;">
    <tr><td style="padding:24px;font-size:14px;line-height:1.5;">
      <p style="margin:0 0 12px;">Kedves ${escapeHtml(name)}!</p>
      <p style="margin:0 0 12px;">Csatoltan küldjük a(z) <strong>${escapeHtml(params.documentTitle)}</strong> dokumentumot, amelyet ${escapeHtml(signedAt)} időpontban írtál alá a Re-Form Stúdióban.</p>
      <p style="margin:0 0 12px;">Ha kérdésed van, válaszolj erre a levélre, vagy keress minket a recepción.</p>
      <p style="margin:0;">Üdvözlettel:<br>Re-Form Stúdió</p>
    </td></tr>
  </table>
</body>
</html>`;
  return { subject, html, text };
}
