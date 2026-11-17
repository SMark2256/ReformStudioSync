import {
  EmailAutomationKind,
  Gender,
  MessageStatus,
  Role,
  toAppError,
} from '@reform/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockStudioEngine } from './mock-engine';
import { mockMailEngine, mockUnsubscribeToken, stripUnsafeHtml } from './mock-mail';

const admin = { id: 'admin-1', name: 'Demó Admin', email: 'admin@reform.hu', role: Role.ADMIN };
const receptionist = {
  id: 'staff-1',
  name: 'Kiss Réka',
  email: 'reka@reform.hu',
  role: Role.RECEPTIONIST,
};

const codeOf = (fn: () => unknown): string | null => {
  try {
    fn();
  } catch (err) {
    return toAppError(err).code;
  }
  return null;
};

/** TICKET-55: a böngészős mock ugyanazokkal a szabályokkal levelez, mint az API. */
describe('mock-engine — levelezés (TICKET-55)', () => {
  beforeEach(() => {
    localStorage.clear();
    mockStudioEngine.resetDatabase();
    mockMailEngine.resetMail();
  });

  it('sablont csak admin kezel; a szkript és az eseménykezelő kikerül', () => {
    expect(
      codeOf(() =>
        mockMailEngine.createTemplate({ name: 'X', subject: 'S', bodyHtml: '<p>a</p>' }, receptionist),
      ),
    ).toBe('AUTH.FORBIDDEN');
    const created = mockMailEngine.createTemplate(
      {
        name: '  Hírlevél  ',
        subject: 'Novemberi ajánlat',
        bodyHtml: '<p onclick="x()">Szia {{keresztnev}}</p><script>alert(1)</script>',
      },
      admin,
    );
    expect(created.name).toBe('Hírlevél');
    expect(created.bodyHtml).toBe('<p>Szia {{keresztnev}}</p>');
    expect(stripUnsafeHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
  });

  it('üres levél nem menthető', () => {
    expect(
      codeOf(() => mockMailEngine.createTemplate({ name: 'Üres', subject: 'S', bodyHtml: '<p> </p>' }, admin)),
    ).toBe('MAIL.EMPTY_CONTENT');
  });

  it('automatikus levél csak sablonnal kapcsolható be; a sablon törlésekor kikapcsol', () => {
    expect(
      codeOf(() => mockMailEngine.updateAutomation(EmailAutomationKind.WELCOME, { enabled: true }, admin)),
    ).toBe('MAIL.AUTOMATION_TEMPLATE_REQUIRED');
    const on = mockMailEngine.updateAutomation(
      EmailAutomationKind.WELCOME,
      { templateId: 'tpl-welcome', enabled: true },
      admin,
    );
    expect(on).toMatchObject({ enabled: true, templateName: 'Üdvözlő levél' });
    expect(on.enabledAt).not.toBeNull();
    expect(mockMailEngine.getTemplates().find((t) => t.id === 'tpl-welcome')?.usedByAutomations).toEqual([
      EmailAutomationKind.WELCOME,
    ]);

    mockMailEngine.deleteTemplate('tpl-welcome', admin);
    const welcome = mockMailEngine.getAutomations(admin).find((a) => a.kind === EmailAutomationKind.WELCOME);
    expect(welcome).toMatchObject({ enabled: false, templateId: null });
  });

  it('új vendég bekapcsolt üdvözlő levéllel levelet kap, cím nélkül nem', () => {
    mockMailEngine.updateAutomation(
      EmailAutomationKind.WELCOME,
      { templateId: 'tpl-welcome', enabled: true },
      admin,
    );
    const withEmail = mockStudioEngine.createGuest({
      firstName: 'Lili',
      lastName: 'Fehér',
      email: 'lili@example.com',
      gender: Gender.FEMALE,
    });
    mockMailEngine.onGuestCreated(withEmail);
    const noEmail = mockStudioEngine.createGuest({ firstName: 'Béla', lastName: 'Kis', gender: Gender.MALE });
    mockMailEngine.onGuestCreated(noEmail);

    const { items } = mockMailEngine.getMessages({ messageType: 'WELCOME' });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      guestId: withEmail.id,
      subject: 'Üdvözlünk a Reform Studio vendégei között',
      status: MessageStatus.SENT,
    });
  });

  it('csoportos küldés: csak a hozzájáruló, címmel rendelkező vendégek; a leiratkozott kiesik', () => {
    const preview = mockMailEngine.previewAudience({ passState: 'ANY' }, admin);
    expect(preview.total).toBeGreaterThan(0);
    expect(preview.matched).toBe(preview.total + preview.excluded.NO_EMAIL + preview.excluded.NO_CONSENT);
    const consenting = mockStudioEngine
      .getGuests()
      .filter((g) => g.isActive && g.marketingConsent && g.email);
    expect(preview.recipients.map((r) => r.guestId).sort()).toEqual(consenting.map((g) => g.id).sort());

    const leaving = preview.recipients[0];
    mockMailEngine.unsubscribe(mockUnsubscribeToken(leaving.guestId));

    const result = mockMailEngine.sendBulk(
      {
        filter: { passState: 'ANY' },
        guestIds: preview.recipients.map((r) => r.guestId),
        subject: 'Ajánlat, {{keresztnev}}',
        bodyHtml: '<p>Kedves {{keresztnev}}!</p>',
      },
      admin,
    );
    expect(result).toMatchObject({ queued: preview.total - 1, skipped: 1 });
    const bulk = mockMailEngine.getMessages({ messageType: 'BULK' }).items;
    expect(bulk.some((m) => m.guestId === leaving.guestId)).toBe(false);
    expect(bulk.every((m) => !m.subject.includes('{{'))).toBe(true);
  });

  it('csoportos küldés recepciósnak tilos', () => {
    expect(codeOf(() => mockMailEngine.previewAudience({}, receptionist))).toBe('AUTH.FORBIDDEN');
  });

  it('a leiratkozó oldal csak a keresztnevet mutatja; a leiratkozás idempotens és visszavonja a hozzájárulást', () => {
    const token = mockUnsubscribeToken('guest-1');
    expect(mockMailEngine.getUnsubscribeInfo(token)).toEqual({
      firstName: 'Anna',
      unsubscribed: false,
      studioName: 'Reform Studio',
    });
    expect(mockMailEngine.unsubscribe(token).unsubscribed).toBe(true);
    const at = mockStudioEngine.getGuestById('guest-1').unsubscribedAt;
    expect(at).toBeTruthy();
    mockMailEngine.unsubscribe(token);
    expect(mockStudioEngine.getGuestById('guest-1')).toMatchObject({ unsubscribedAt: at, marketingConsent: false });
    expect(codeOf(() => mockMailEngine.getUnsubscribeInfo('demo-nincs-ilyen'))).toBe('MAIL.UNSUBSCRIBE_INVALID');
  });

  it('a hozzájárulás újbóli megadása törli a leiratkozást', () => {
    mockMailEngine.unsubscribe(mockUnsubscribeToken('guest-1'));
    const updated = mockStudioEngine.updateGuest('guest-1', { marketingConsent: true });
    expect(updated).toMatchObject({ marketingConsent: true, unsubscribedAt: null });
  });

  it('egyéni levél: cím nélkül hiba; a vendég előzményeiben a régi napló is látszik', () => {
    const noEmail = mockStudioEngine.createGuest({ firstName: 'Béla', lastName: 'Kis', gender: Gender.MALE });
    expect(
      codeOf(() =>
        mockMailEngine.sendToGuest(noEmail.id, { subject: 'S', bodyHtml: '<p>a</p>' }, receptionist),
      ),
    ).toBe('MAIL.GUEST_NO_EMAIL');

    const sent = mockMailEngine.sendToGuest(
      'guest-1',
      { subject: 'Időpont, {{keresztnev}}', bodyHtml: '<p>Holnap 10-kor várunk.</p>' },
      receptionist,
    );
    expect(sent).toMatchObject({ subject: 'Időpont, Anna', messageType: 'MANUAL', createdByName: 'Kiss Réka' });
    const history = mockMailEngine.getGuestMessages('guest-1');
    expect(history[0].id).toBe(sent.id);
    expect(history.some((m) => m.id === 'msg-1')).toBe(true);
  });

  it('a napló szűr állapotra, sablonra és keresőszóra', () => {
    mockMailEngine.sendToGuest(
      'guest-1',
      { subject: 'Szia', bodyHtml: '<p>a</p>', templateId: 'tpl-birthday' },
      receptionist,
    );
    mockMailEngine.sendTest({ subject: 'Próba', bodyHtml: '<p>b</p>' }, admin);
    expect(mockMailEngine.getMessages({ templateId: 'tpl-birthday' }).total).toBe(1);
    expect(mockMailEngine.getMessages({ q: 'próba' }).items[0].recipientEmail).toBe(admin.email);
    expect(mockMailEngine.getMessages({ status: MessageStatus.FAILED }).total).toBe(0);
    expect(mockMailEngine.getMessages({ from: '2000-01-01', to: '2000-01-02' }).total).toBe(0);
  });
});
