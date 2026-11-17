import {
  fillPlaceholders,
  findUnknownPlaceholders,
  placeholderValuesFor,
  SAMPLE_PLACEHOLDER_VALUES,
} from '@reform/shared';
import { describe, expect, it } from 'vitest';
import { buildEmail, cleanEmailContent, htmlToText, sanitizeEmailHtml } from './mail-content';

describe('Sablonrenderelés (TICKET-55)', () => {
  const values = placeholderValuesFor({ firstName: 'Anna', lastName: 'Kovács' }, 'Reform Studio');

  it('a mezők a vendég adataival töltődnek ki, kis- és nagybetűtől, szóköztől függetlenül', () => {
    expect(
      fillPlaceholders('{{keresztnev}} · {{ VEZETEKNEV }} · {{teljes_nev}} · {{studio_nev}}', values, {
        html: false,
      }),
    ).toBe('Anna · Kovács · Kovács Anna · Reform Studio');
  });

  it('HTML-ben a vendég neve escape-elve kerül be (nem csempészhet jelölést)', () => {
    const evil = placeholderValuesFor({ firstName: '<script>x</script>', lastName: 'A&B' });
    expect(fillPlaceholders('<p>{{keresztnev}} {{vezeteknev}}</p>', evil, { html: true })).toBe(
      '<p>&lt;script&gt;x&lt;/script&gt; A&amp;B</p>',
    );
  });

  it('az ismeretlen mező változatlan marad, és listázható', () => {
    expect(fillPlaceholders('Szia {{becenev}}!', SAMPLE_PLACEHOLDER_VALUES, { html: false })).toBe(
      'Szia {{becenev}}!',
    );
    expect(findUnknownPlaceholders('{{keresztnev}} {{becenev}} {{becenev}} {{Kor}}')).toEqual([
      'becenev',
      'Kor',
    ]);
  });

  it('a kész levél: kitöltött tárgy, keret, szöveges változat; marketingnél leiratkozó link', () => {
    const email = buildEmail({
      subject: 'Boldog születésnapot, {{keresztnev}}!',
      bodyHtml: '<p>Kedves {{keresztnev}}!</p><p><a href="https://reformstudio.hu">Oldalunk</a></p>',
      values,
      unsubscribeUrl: 'https://app.example/leiratkozas/abc',
    });
    expect(email.subject).toBe('Boldog születésnapot, Anna!');
    expect(email.html).toContain('<p>Kedves Anna!</p>');
    expect(email.html).toContain('href="https://app.example/leiratkozas/abc"');
    expect(email.text).toContain('Kedves Anna!');
    expect(email.text).toContain('Oldalunk (https://reformstudio.hu)');
    expect(email.text).toContain('Leiratkozás a hírlevelekről és ajánlatokról: https://app.example/leiratkozas/abc');
  });

  it('tranzakciós levélben nincs leiratkozó link', () => {
    const email = buildEmail({ subject: 'Üdv', bodyHtml: '<p>Szia</p>', values });
    expect(email.html).not.toContain('leiratkozas');
    expect(email.text).toContain('Ezt a levelet a Reform Studio küldte.');
  });
});

describe('Szanitizálás (TICKET-55)', () => {
  it('a script, az eseménykezelő, a stíluslap és az iframe kikerül', () => {
    const html = sanitizeEmailHtml(
      '<p onclick="alert(1)">Szia<script>alert(1)</script></p><style>p{}</style><iframe src="https://x"></iframe>',
    );
    expect(html).toBe('<p>Szia</p>');
  });

  it('a javascript: és data: URL nem marad meg; a kép https URL-lel igen', () => {
    const html = sanitizeEmailHtml(
      '<a href="javascript:alert(1)">x</a><img src="data:image/png;base64,AAA"><img src="https://cdn.example/kep.png" alt="Kép" onerror="x()">',
    );
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('data:');
    expect(html).not.toContain('onerror');
    expect(html).toContain('<img src="https://cdn.example/kep.png" alt="Kép" />');
  });

  it('a link új lapon nyílik, a formázás és az igazítás megmarad, más stílus nem', () => {
    const html = sanitizeEmailHtml(
      '<h2 style="text-align: center; color: red">Cím</h2><p><strong>Vastag</strong> <em>dőlt</em> <u>aláhúzott</u></p><ul><li>egy</li></ul><a href="https://reformstudio.hu">Link</a>',
    );
    expect(html).toContain('<h2 style="text-align:center">Cím</h2>');
    expect(html).toContain('<strong>Vastag</strong> <em>dőlt</em> <u>aláhúzott</u>');
    expect(html).toContain('<ul><li>egy</li></ul>');
    expect(html).toContain('<a href="https://reformstudio.hu" target="_blank" rel="noopener noreferrer">Link</a>');
  });

  it('üres tárgy vagy csak jelölésből álló törzs nem menthető', () => {
    expect(() => cleanEmailContent({ subject: '  ', bodyHtml: '<p>Szia</p>' })).toThrow(
      expect.objectContaining({ code: 'MAIL.EMPTY_CONTENT' }),
    );
    expect(() => cleanEmailContent({ subject: 'Tárgy', bodyHtml: '<p><br></p><script>x</script>' })).toThrow(
      expect.objectContaining({ code: 'MAIL.EMPTY_CONTENT' }),
    );
    expect(cleanEmailContent({ subject: ' Tárgy \n sor ', bodyHtml: '<p><img src="https://x/y.png"></p>' })).toEqual({
      subject: 'Tárgy sor',
      bodyHtml: '<p><img src="https://x/y.png" /></p>',
    });
  });

  it('a szöveges változat sortöréseket és listát tart', () => {
    expect(htmlToText('<p>Első&nbsp;sor<br>Második</p><ul><li>a</li><li>b</li></ul><p>A &amp; B</p>')).toBe(
      'Első sor\nMásodik\n- a\n- b\n\nA & B',
    );
  });
});
