import { describe, expect, it } from 'vitest';
import {
  draftHasContent,
  normalizeImageUrl,
  normalizeLinkUrl,
  renderDraftPreview,
  unknownPlaceholdersIn,
} from './emailDraft';

describe('levélszerkesztő (TICKET-55)', () => {
  it('a hivatkozás séma nélkül https lesz, a veszélyes séma tilos', () => {
    expect(normalizeLinkUrl('reformstudio.hu/arak')).toBe('https://reformstudio.hu/arak');
    expect(normalizeLinkUrl('mailto:info@reformstudio.hu')).toBe('mailto:info@reformstudio.hu');
    expect(normalizeLinkUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeLinkUrl('   ')).toBeNull();
  });

  it('kép csak webcímről szúrható be', () => {
    expect(normalizeImageUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
    expect(normalizeImageUrl('data:image/png;base64,AAAA')).toBeNull();
    expect(normalizeImageUrl('mailto:a@b.hu')).toBeNull();
  });

  it('tárgy és szöveg vagy kép kell a küldéshez', () => {
    expect(draftHasContent({ subject: 'Szia', bodyHtml: '<p>&nbsp;</p>' })).toBe(false);
    expect(draftHasContent({ subject: ' ', bodyHtml: '<p>Szöveg</p>' })).toBe(false);
    expect(draftHasContent({ subject: 'Szia', bodyHtml: '<p><img src="https://x.hu/a.png"></p>' })).toBe(true);
    expect(draftHasContent({ subject: 'Szia', bodyHtml: '<p>Kedves Anna!</p>' })).toBe(true);
  });

  it('az előnézet kitölti a mezőket és marketingnél leiratkozó linket tesz a láblécbe', () => {
    const draft = { subject: 'Boldog névnapot, {{keresztnev}}', bodyHtml: '<p>Kedves {{teljes_nev}}!</p>' };
    const preview = renderDraftPreview(draft, { marketing: true });
    expect(preview.subject).toBe('Boldog névnapot, Anna');
    expect(preview.html).toContain('Kedves Kovács Anna!');
    expect(preview.html).toContain('leiratkozás');
    expect(renderDraftPreview(draft).html).not.toContain('leiratkozás');
  });

  it('az előnézetben a vendég neve escape-elve kerül a HTML-be', () => {
    const values = { keresztnev: '<b>X</b>', vezeteknev: '', teljes_nev: '', studio_nev: 'R' };
    expect(renderDraftPreview({ subject: 's', bodyHtml: '<p>{{keresztnev}}</p>' }, { values }).html).toContain(
      '&lt;b&gt;X&lt;/b&gt;',
    );
  });

  it('az elírt mezőnevet jelzi', () => {
    expect(unknownPlaceholdersIn({ subject: '{{keresztnev}}', bodyHtml: '<p>{{kersztnev}}</p>' })).toEqual([
      'kersztnev',
    ]);
  });
});
