import { describe, expect, it } from 'vitest';
import { firstNameOf, formatRequestedAt, renderLoginCodeEmail } from './login-code';

describe('Belépőkód levél sablonja (TICKET-35)', () => {
  const requestedAt = new Date('2026-11-11T15:42:00.000Z');

  it('a tárgy elején a kód, a levélben keresztnév, kód, érvényesség és budapesti idő', () => {
    const { subject, html, text } = renderLoginCodeEmail({
      code: '847291',
      name: 'Siklódi Márk',
      ttlMinutes: 10,
      requestedAt,
    });

    expect(subject).toBe('847291 – ReformStudio Sync belépőkód');
    expect(html).toContain('Szia Márk!');
    expect(html).toContain('>847291</span>');
    expect(html).toContain('10 percig</strong>');
    expect(html).toContain('Kérés időpontja: 2026. november 11., 16:42');
    expect(html).not.toMatch(/\{\{|\}\}/);

    expect(text).toContain('Szia Márk!');
    expect(text).toContain('\n847291\n');
    expect(text).toContain('A kód 10 percig érvényes');
    expect(text).toContain('Kérés időpontja: 2026. november 11., 16:42');
  });

  it('a beillesztett értékeket HTML-escape-eli', () => {
    const { html } = renderLoginCodeEmail({
      code: '123456',
      name: 'Teszt <script>alert("x")</script>',
      ttlMinutes: 10,
      requestedAt,
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;/script&gt;');
  });

  it('keresztnév: a név utolsó tagja', () => {
    expect(firstNameOf('Siklódi Brigi')).toBe('Brigi');
    expect(firstNameOf('  Dr. Kovács   Réka ')).toBe('Réka');
    expect(firstNameOf('Anna')).toBe('Anna');
  });

  it('nyári időszámításban is budapesti idő', () => {
    expect(formatRequestedAt(new Date('2026-07-01T06:05:00.000Z'))).toBe('2026. július 1., 08:05');
  });
});
