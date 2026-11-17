import {
  appError,
  AudienceEntitlement,
  AuthUserDto,
  CheckInStatus,
  DEFAULT_MAIL_HOURLY_LIMIT,
  EMAIL_BULK_MAX_RECIPIENTS,
  EmailAudienceFilterDto,
  EmailAudiencePreviewDto,
  EmailAutomationDto,
  EmailAutomationKind,
  emailCategoryFor,
  EmailMessageListDto,
  EmailMessageListQueryDto,
  EmailMessageType,
  EmailTemplateDto,
  fillPlaceholders,
  GuestDto,
  MailStatusDto,
  marketingExclusion,
  matchesAudienceFilter,
  MembershipStatus,
  MessageLogDto,
  MessageStatus,
  PassStatus,
  placeholderValuesFor,
  Role,
  SaveEmailTemplateDto,
  SendBulkEmailDto,
  SendBulkEmailResultDto,
  SendGuestEmailDto,
  SendTestEmailDto,
  STUDIO_DISPLAY_NAME,
  studioDayRange,
  UnsubscribeInfoDto,
  UpdateEmailAutomationDto,
} from '@reform/shared';
import { mockStudioEngine } from './mock-engine';

// A Levelezés (TICKET-55) kliensoldali párja: sablonok, automatikus levelek, csoportos és egyéni
// küldés, napló, leiratkozás. A vendégek a mock motorban élnek (hozzájárulás, leiratkozás), a
// levelezés saját tárolóban. Demóban nem megy ki valódi levél: a sorba került levél azonnal
// „Elküldve” lesz.
const MAIL_STORAGE_KEY = 'reform-studio-mock-mail-v1';

interface MockMailState {
  templates: EmailTemplateDto[];
  automations: EmailAutomationDto[];
  messages: MessageLogDto[];
}

type StaffUser = Pick<AuthUserDto, 'id' | 'name' | 'email' | 'role'> | null | undefined;

const AUTOMATION_ORDER = [
  EmailAutomationKind.WELCOME,
  EmailAutomationKind.BIRTHDAY,
  EmailAutomationKind.NAME_DAY,
];

/** A demó vendég leiratkozó tokenje (élesben véletlen UUID a `guests.unsubscribe_token`-ben). */
export const mockUnsubscribeToken = (guestId: string) => `demo-${guestId}`;

function createInitialMailState(now = new Date()): MockMailState {
  const at = now.toISOString();
  const template = (id: string, name: string, subject: string, bodyHtml: string): EmailTemplateDto => ({
    id,
    name,
    subject,
    bodyHtml,
    createdAt: at,
    updatedAt: at,
    updatedByName: 'Demó Munkatárs',
    usedByAutomations: [],
  });
  return {
    templates: [
      template(
        'tpl-welcome',
        'Üdvözlő levél',
        'Üdvözlünk a {{studio_nev}} vendégei között',
        '<p>Kedves {{keresztnev}}!</p><p>Örülünk, hogy nálunk jársz. A belépőkártyádat a recepción kapod meg.</p><p>Üdvözlettel:<br>a {{studio_nev}} csapata</p>',
      ),
      template(
        'tpl-birthday',
        'Születésnapi köszöntő',
        'Boldog születésnapot, {{keresztnev}}!',
        '<p>Kedves {{keresztnev}}!</p><p>Nagyon boldog születésnapot kíván a {{studio_nev}} csapata.</p>',
      ),
      template(
        'tpl-nameday',
        'Névnapi köszöntő',
        'Boldog névnapot, {{keresztnev}}!',
        '<p>Kedves {{keresztnev}}!</p><p>Boldog névnapot kíván a {{studio_nev}} csapata.</p>',
      ),
    ],
    automations: AUTOMATION_ORDER.map((kind) => ({
      kind,
      enabled: false,
      templateId: null,
      templateName: null,
      category: emailCategoryFor(kind),
      enabledAt: null,
      updatedAt: at,
    })),
    messages: [],
  };
}

/** Az API szanitizálásának közelítése (a demóban): script, stíluslap, eseménykezelő, `javascript:` ki. */
export function stripUnsafeHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  doc.querySelectorAll('script, style, iframe, object, embed, form, link, meta').forEach((el) => el.remove());
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      const value = attr.value.trim().toLowerCase();
      if (attr.name.startsWith('on') || value.startsWith('javascript:') || value.startsWith('data:')) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return doc.body.innerHTML.trim();
}

function cleanContent(input: { subject: string; bodyHtml: string }) {
  const subject = input.subject.replace(/\s+/g, ' ').trim();
  const bodyHtml = stripUnsafeHtml(input.bodyHtml);
  const hasText = bodyHtml.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0;
  if (!subject || !(hasText || /<img\b[^>]*\ssrc=/i.test(bodyHtml))) {
    throw appError('MAIL.EMPTY_CONTENT');
  }
  return { subject, bodyHtml };
}

function requireAdmin(user: StaffUser) {
  if (user?.role !== Role.ADMIN) throw appError('AUTH.FORBIDDEN');
}

const guestName = (g: Pick<GuestDto, 'firstName' | 'lastName'>) => `${g.lastName} ${g.firstName}`;

class MockMailEngine {
  private load(): MockMailState {
    if (typeof window === 'undefined') return createInitialMailState();
    try {
      const raw = localStorage.getItem(MAIL_STORAGE_KEY);
      if (raw) return JSON.parse(raw) as MockMailState;
    } catch {
      // Hibás tárolt állapot: újrakezdjük.
    }
    const initial = createInitialMailState();
    this.save(initial);
    return initial;
  }

  private save(state: MockMailState) {
    if (typeof window === 'undefined') return;
    for (const t of state.templates) {
      t.usedByAutomations = state.automations.filter((a) => a.templateId === t.id).map((a) => a.kind);
    }
    localStorage.setItem(MAIL_STORAGE_KEY, JSON.stringify(state));
  }

  resetMail(): void {
    this.save(createInitialMailState());
  }

  /** A sorba kerülés; a demóban rögtön „elküldve” (vagy hibás, ha nincs cím / hozzájárulás). */
  private enqueue(
    state: MockMailState,
    input: {
      guest: GuestDto | null;
      recipientEmail: string;
      recipientName: string;
      messageType: EmailMessageType;
      subject: string;
      templateId?: string | null;
      createdBy?: StaffUser;
    },
  ): MessageLogDto {
    const now = new Date().toISOString();
    const template = state.templates.find((t) => t.id === input.templateId) ?? null;
    const values = placeholderValuesFor(input.guest ?? { firstName: '', lastName: input.recipientName });
    const message: MessageLogDto = {
      id: `mail-${Date.now()}-${state.messages.length}`,
      guestId: input.guest?.id ?? null,
      guestName: input.guest ? guestName(input.guest) : undefined,
      recipientEmail: input.recipientEmail,
      recipientName: input.recipientName,
      subject: fillPlaceholders(input.subject, values, { html: false }),
      messageType: input.messageType,
      category: emailCategoryFor(input.messageType),
      status: MessageStatus.SENT,
      templateId: template?.id ?? null,
      templateName: template?.name ?? null,
      attempts: 1,
      createdAt: now,
      sentAt: now,
      nextAttemptAt: null,
      errorDetails: null,
      createdByName: input.createdBy?.name ?? null,
    };
    state.messages.unshift(message);
    return message;
  }

  getStatus(now = new Date()): MailStatusDto {
    const { messages } = this.load();
    const hourAgo = now.getTime() - 60 * 60 * 1000;
    return {
      configured: true,
      hourlyLimit: DEFAULT_MAIL_HOURLY_LIMIT,
      sentLastHour: messages.filter(
        (m) => m.status === MessageStatus.SENT && m.sentAt && new Date(m.sentAt).getTime() >= hourAgo,
      ).length,
      pendingCount: messages.filter((m) => m.status === MessageStatus.PENDING).length,
      failedCount: messages.filter((m) => m.status === MessageStatus.FAILED).length,
    };
  }

  getTemplates(): EmailTemplateDto[] {
    return [...this.load().templates].sort((a, b) => a.name.localeCompare(b.name, 'hu'));
  }

  createTemplate(input: SaveEmailTemplateDto, user: StaffUser): EmailTemplateDto {
    requireAdmin(user);
    const state = this.load();
    const name = input.name.replace(/\s+/g, ' ').trim();
    if (!name) throw appError('COMMON.VALIDATION_FAILED', { message: 'A sablon neve kötelező.' });
    const now = new Date().toISOString();
    const created: EmailTemplateDto = {
      id: `tpl-${Date.now()}`,
      name,
      ...cleanContent(input),
      createdAt: now,
      updatedAt: now,
      updatedByName: user?.name ?? null,
      usedByAutomations: [],
    };
    state.templates.push(created);
    this.save(state);
    return created;
  }

  updateTemplate(id: string, input: SaveEmailTemplateDto, user: StaffUser): EmailTemplateDto {
    requireAdmin(user);
    const state = this.load();
    const template = state.templates.find((t) => t.id === id);
    if (!template) throw appError('MAIL.TEMPLATE_NOT_FOUND');
    const name = input.name.replace(/\s+/g, ' ').trim();
    if (!name) throw appError('COMMON.VALIDATION_FAILED', { message: 'A sablon neve kötelező.' });
    Object.assign(template, {
      name,
      ...cleanContent(input),
      updatedAt: new Date().toISOString(),
      updatedByName: user?.name ?? null,
    });
    for (const a of state.automations) if (a.templateId === id) a.templateName = name;
    this.save(state);
    return template;
  }

  deleteTemplate(id: string, user: StaffUser): { deletedId: string } {
    requireAdmin(user);
    const state = this.load();
    if (!state.templates.some((t) => t.id === id)) throw appError('MAIL.TEMPLATE_NOT_FOUND');
    state.templates = state.templates.filter((t) => t.id !== id);
    for (const a of state.automations) {
      if (a.templateId !== id) continue;
      Object.assign(a, { templateId: null, templateName: null, enabled: false });
    }
    this.save(state);
    return { deletedId: id };
  }

  sendTest(input: SendTestEmailDto, user: StaffUser): MessageLogDto {
    requireAdmin(user);
    const content = cleanContent(input);
    const state = this.load();
    const parts = (user?.name ?? '').trim().split(/\s+/);
    const firstName = parts.pop() ?? '';
    const message = this.enqueue(state, {
      guest: null,
      recipientEmail: user?.email ?? 'demo@reformstudio.hu',
      recipientName: user?.name ?? 'Demó Munkatárs',
      messageType: 'TEST',
      subject: fillPlaceholders(
        `[Teszt] ${content.subject}`,
        placeholderValuesFor({ firstName, lastName: parts.join(' ') }),
        { html: false },
      ),
    });
    this.save(state);
    return message;
  }

  getAutomations(user: StaffUser): EmailAutomationDto[] {
    requireAdmin(user);
    return this.load().automations;
  }

  updateAutomation(
    kind: EmailAutomationKind,
    input: UpdateEmailAutomationDto,
    user: StaffUser,
  ): EmailAutomationDto {
    requireAdmin(user);
    const state = this.load();
    const automation = state.automations.find((a) => a.kind === kind);
    if (!automation) throw appError('COMMON.NOT_FOUND');
    const templateId = input.templateId === undefined ? automation.templateId : input.templateId;
    const template = templateId ? state.templates.find((t) => t.id === templateId) : null;
    if (templateId && !template) throw appError('MAIL.TEMPLATE_NOT_FOUND');
    const enabled = input.enabled ?? automation.enabled;
    if (enabled && !template) throw appError('MAIL.AUTOMATION_TEMPLATE_REQUIRED');
    const now = new Date().toISOString();
    Object.assign(automation, {
      enabled,
      templateId: template?.id ?? null,
      templateName: template?.name ?? null,
      enabledAt: enabled && !automation.enabled ? now : automation.enabledAt,
      updatedAt: now,
    });
    this.save(state);
    return automation;
  }

  /** Üdvözlő levél az új vendégnek (az API `onGuestCreated` párja). */
  onGuestCreated(guest: GuestDto): void {
    const state = this.load();
    const welcome = state.automations.find((a) => a.kind === EmailAutomationKind.WELCOME);
    const template = state.templates.find((t) => t.id === welcome?.templateId);
    if (!welcome?.enabled || !template || !guest.email) return;
    this.enqueue(state, {
      guest,
      recipientEmail: guest.email,
      recipientName: guestName(guest),
      messageType: 'WELCOME',
      subject: template.subject,
      templateId: template.id,
    });
    this.save(state);
  }

  private resolveAudience(filter: EmailAudienceFilterDto, now: Date) {
    const excluded = { NO_EMAIL: 0, NO_CONSENT: 0 };
    const eligible: GuestDto[] = [];
    let matched = 0;
    const guests = mockStudioEngine
      .getGuests()
      .filter((g) => g.isActive)
      .sort((a, b) => guestName(a).localeCompare(guestName(b), 'hu'));
    for (const guest of guests) {
      const entitlements: AudienceEntitlement[] = [
        ...(guest.passes ?? [])
          .filter((p) => p.status !== PassStatus.CANCELLED)
          .map((p) => ({
            serviceId: p.serviceId ?? null,
            current: p.status === PassStatus.ACTIVE || p.status === PassStatus.NOT_STARTED,
          })),
        ...(guest.memberships ?? []).map((m) => ({
          serviceId: m.serviceId ?? null,
          current: m.status === MembershipStatus.ACTIVE,
        })),
      ];
      const lastVisitAt =
        (guest.arrivals ?? [])
          .filter((a) => a.status === CheckInStatus.SUCCESS)
          .map((a) => a.occurredAt)
          .sort()
          .at(-1) ?? null;
      if (!matchesAudienceFilter({ entitlements, lastVisitAt }, filter, now)) continue;
      matched += 1;
      const exclusion = marketingExclusion(guest);
      if (exclusion) {
        excluded[exclusion] += 1;
        continue;
      }
      eligible.push(guest);
    }
    return { matched, excluded, eligible };
  }

  previewAudience(filter: EmailAudienceFilterDto, user: StaffUser, now = new Date()): EmailAudiencePreviewDto {
    requireAdmin(user);
    const { matched, excluded, eligible } = this.resolveAudience(filter, now);
    return {
      matched,
      total: eligible.length,
      recipients: eligible.map((g) => ({ guestId: g.id, name: guestName(g), email: g.email!.trim() })),
      excluded,
    };
  }

  sendBulk(input: SendBulkEmailDto, user: StaffUser, now = new Date()): SendBulkEmailResultDto {
    requireAdmin(user);
    const content = cleanContent(input);
    const requested = new Set(input.guestIds);
    if (requested.size > EMAIL_BULK_MAX_RECIPIENTS) throw appError('MAIL.TOO_MANY_RECIPIENTS');
    const recipients = this.resolveAudience(input.filter, now).eligible.filter((g) => requested.has(g.id));
    if (recipients.length === 0) throw appError('MAIL.NO_RECIPIENTS');
    const state = this.load();
    for (const guest of recipients) {
      this.enqueue(state, {
        guest,
        recipientEmail: guest.email!.trim(),
        recipientName: guestName(guest),
        messageType: 'BULK',
        subject: content.subject,
        templateId: input.templateId,
        createdBy: user,
      });
    }
    this.save(state);
    return {
      batchId: `batch-${Date.now()}`,
      queued: recipients.length,
      skipped: requested.size - recipients.length,
    };
  }

  sendToGuest(guestId: string, input: SendGuestEmailDto, user: StaffUser): MessageLogDto {
    const guest = mockStudioEngine.getGuestById(guestId);
    const email = guest.email?.trim();
    if (!email) throw appError('MAIL.GUEST_NO_EMAIL');
    const content = cleanContent(input);
    const state = this.load();
    const message = this.enqueue(state, {
      guest,
      recipientEmail: email,
      recipientName: guestName(guest),
      messageType: 'MANUAL',
      subject: content.subject,
      templateId: input.templateId,
      createdBy: user,
    });
    this.save(state);
    return message;
  }

  getMessages(query: EmailMessageListQueryDto = {}): EmailMessageListDto {
    const q = query.q?.trim().toLowerCase();
    const { gte, lt } = studioDayRange(query.from, query.to);
    const filtered = this.load().messages.filter(
      (m) =>
        (!query.status || m.status === query.status) &&
        (!query.messageType || m.messageType === query.messageType) &&
        (!query.templateId || m.templateId === query.templateId) &&
        (!gte || new Date(m.createdAt ?? m.sentAt ?? 0) >= gte) &&
        (!lt || new Date(m.createdAt ?? m.sentAt ?? 0) < lt) &&
        (!q ||
          m.recipientEmail.toLowerCase().includes(q) ||
          (m.recipientName ?? '').toLowerCase().includes(q) ||
          m.subject.toLowerCase().includes(q)),
    );
    const offset = query.offset ?? 0;
    return { items: filtered.slice(offset, offset + (query.limit ?? 50)), total: filtered.length };
  }

  /** A vendég előzményei: a sor levelei és a TICKET-55 előtti napló. */
  getGuestMessages(guestId: string): MessageLogDto[] {
    const legacy = mockStudioEngine.getGuestById(guestId).messageLogs ?? [];
    const queued = this.load().messages.filter((m) => m.guestId === guestId);
    return [...queued, ...legacy].sort((a, b) =>
      (b.createdAt ?? b.sentAt ?? '').localeCompare(a.createdAt ?? a.sentAt ?? ''),
    );
  }

  retryMessage(id: string): MessageLogDto {
    const state = this.load();
    const message = state.messages.find((m) => m.id === id);
    if (!message) throw appError('MAIL.MESSAGE_NOT_FOUND');
    if (message.status !== MessageStatus.FAILED) throw appError('MAIL.NOT_RETRYABLE');
    Object.assign(message, {
      status: MessageStatus.SENT,
      sentAt: new Date().toISOString(),
      attempts: 1,
      errorDetails: null,
    });
    this.save(state);
    return message;
  }

  private guestByToken(token: string): GuestDto {
    const guest = mockStudioEngine.getGuests().find((g) => mockUnsubscribeToken(g.id) === token);
    if (!guest) throw appError('MAIL.UNSUBSCRIBE_INVALID');
    return guest;
  }

  getUnsubscribeInfo(token: string): UnsubscribeInfoDto {
    const guest = this.guestByToken(token);
    return {
      firstName: guest.firstName,
      unsubscribed: Boolean(guest.unsubscribedAt) || !guest.marketingConsent,
      studioName: STUDIO_DISPLAY_NAME,
    };
  }

  unsubscribe(token: string): UnsubscribeInfoDto {
    const guest = this.guestByToken(token);
    mockStudioEngine.markGuestUnsubscribed(guest.id);
    return { firstName: guest.firstName, unsubscribed: true, studioName: STUDIO_DISPLAY_NAME };
  }
}

export const mockMailEngine = new MockMailEngine();
