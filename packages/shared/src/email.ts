import { CalendarDay, getStudioDate, STUDIO_TIME_ZONE } from './membership-dues';

/**
 * Vendégkommunikáció (TICKET-55): sablonmezők, a levél keretezése, az automatikus levelek napjai
 * és a csoportos küldés szűrője. Tiszta függvények: az API és a kliensoldali mock motor (és az
 * élő előnézet) ugyanezt használja.
 */

/** A levelekben megjelenő stúdiónév (`{{studio_nev}}`). */
export const STUDIO_DISPLAY_NAME = 'Reform Studio';

export enum EmailCategory {
  /** Szolgáltatási levél (üdvözlés, egyéni levél, tesztlevél): hozzájárulás nélkül is kimehet. */
  TRANSACTIONAL = 'TRANSACTIONAL',
  /** Marketing: csak a vendég hozzájárulásával, mindig leiratkozó linkkel. */
  MARKETING = 'MARKETING',
}

export enum EmailAutomationKind {
  WELCOME = 'WELCOME',
  BIRTHDAY = 'BIRTHDAY',
  NAME_DAY = 'NAME_DAY',
}

/** A levél forrása (`message_logs.message_type`); a régi sorokban szabad szöveg is lehet. */
export type EmailMessageType =
  | `${EmailAutomationKind}`
  /** Egyéni levél a vendégadatlapról. */
  | 'MANUAL'
  /** Csoportos küldés. */
  | 'BULK'
  /** Tesztlevél a bejelentkezett munkatárs címére. */
  | 'TEST';

/**
 * A levél kategóriája a forrása szerint (adatvédelmi döntés, TICKET-55):
 * - az üdvözlő levél a regisztráció visszaigazolása → tranzakciós;
 * - a születés- és névnapi köszöntő nem szükséges a szolgáltatáshoz → marketing;
 * - a csoportos küldés mindig marketing (hírlevél, ajánlat), csak hozzájárulással;
 * - az egyéni levél egy vendégnek, egy munkatárstól (válasz, egyeztetés) → tranzakciós;
 * - a tesztlevél a munkatárs saját címére megy → tranzakciós.
 */
export function emailCategoryFor(type: EmailMessageType): EmailCategory {
  switch (type) {
    case 'BIRTHDAY':
    case 'NAME_DAY':
    case 'BULK':
      return EmailCategory.MARKETING;
    default:
      return EmailCategory.TRANSACTIONAL;
  }
}

export const EMAIL_SUBJECT_MAX_LENGTH = 200;
export const EMAIL_TEMPLATE_NAME_MAX_LENGTH = 120;
export const EMAIL_BODY_MAX_LENGTH = 100_000;
/** Ennyi címzett mehet egy csoportos küldésben (a sor úgyis az óránkénti korláttal küld). */
export const EMAIL_BULK_MAX_RECIPIENTS = 2000;

// ---------------------------------------------------------------------------
// Sablonmezők
// ---------------------------------------------------------------------------

export const EMAIL_PLACEHOLDERS = [
  { key: 'keresztnev', label: 'Keresztnév', sample: 'Anna' },
  { key: 'vezeteknev', label: 'Vezetéknév', sample: 'Kovács' },
  { key: 'teljes_nev', label: 'Teljes név', sample: 'Kovács Anna' },
  { key: 'studio_nev', label: 'Stúdió neve', sample: STUDIO_DISPLAY_NAME },
] as const;

export type EmailPlaceholderKey = (typeof EMAIL_PLACEHOLDERS)[number]['key'];
export type EmailPlaceholderValues = Record<EmailPlaceholderKey, string>;

export const SAMPLE_PLACEHOLDER_VALUES = Object.fromEntries(
  EMAIL_PLACEHOLDERS.map((p) => [p.key, p.sample]),
) as EmailPlaceholderValues;

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;
const KNOWN_PLACEHOLDERS = new Set<string>(EMAIL_PLACEHOLDERS.map((p) => p.key));

/** A mezők értékei egy vendéghez (magyar névsorrend: vezetéknév, keresztnév). */
export function placeholderValuesFor(
  person: { firstName: string; lastName: string },
  studioName: string = STUDIO_DISPLAY_NAME,
): EmailPlaceholderValues {
  const firstName = person.firstName.trim();
  const lastName = person.lastName.trim();
  return {
    keresztnev: firstName,
    vezeteknev: lastName,
    teljes_nev: [lastName, firstName].filter(Boolean).join(' '),
    studio_nev: studioName,
  };
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/**
 * A `{{mezo}}` helyére az érték kerül (kis- és nagybetűtől, szóköztől függetlenül). HTML-ben
 * (`html: true`) az érték escape-elve: a vendég neve nem csempészhet be jelölést. Az ismeretlen
 * mező változatlan marad, hogy az előnézetben feltűnjön.
 */
export function fillPlaceholders(
  text: string,
  values: EmailPlaceholderValues,
  options: { html: boolean },
): string {
  return text.replace(PLACEHOLDER_PATTERN, (match, rawKey: string) => {
    const key = rawKey.toLowerCase();
    if (!KNOWN_PLACEHOLDERS.has(key)) return match;
    const value = values[key as EmailPlaceholderKey];
    return options.html ? escapeHtml(value) : value;
  });
}

/** Az ismeretlen mezőnevek (elírás), előfordulási sorrendben, ismétlés nélkül. */
export function findUnknownPlaceholders(text: string): string[] {
  const unknown = new Set<string>();
  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    const key = match[1].toLowerCase();
    if (!KNOWN_PLACEHOLDERS.has(key)) unknown.add(match[1]);
  }
  return [...unknown];
}

// ---------------------------------------------------------------------------
// A levél kerete
// ---------------------------------------------------------------------------

export interface EmailDocumentParams {
  subject: string;
  /** A levél törzse; az API-n már szanitizált HTML. */
  bodyHtml: string;
  studioName?: string;
  /** Marketing levélnél kötelező: a láblécben leiratkozó link. */
  unsubscribeUrl?: string | null;
}

/**
 * A teljes HTML levél: táblázatos, inline stílusú keret (e-mail kliensekhez), a sablon törzsével és
 * a lábléccel. Ugyanezt mutatja az élő előnézet is.
 */
export function renderEmailDocument(params: EmailDocumentParams): string {
  const studio = escapeHtml(params.studioName ?? STUDIO_DISPLAY_NAME);
  const font = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const footer = params.unsubscribeUrl
    ? `Ezt a levelet azért kaptad, mert hozzájárultál, hogy a ${studio} hírleveleket és ajánlatokat küldjön.<br>` +
      `Ha nem szeretnél több ilyen levelet: <a href="${escapeHtml(params.unsubscribeUrl)}" style="color:#6b7280;text-decoration:underline;">leiratkozás</a>.`
    : `Ezt a levelet a ${studio} küldte.`;

  return `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(params.subject)}</title>
<style>
  .email-body img { max-width: 100%; height: auto; }
  .email-body a { color: #0f766e; }
  @media only screen and (max-width: 620px) { .card-pad { padding: 24px 20px !important; } }
</style>
</head>
<body style="margin:0;padding:0;background:#f3f5f7;-webkit-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f5f7;">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
          <tr>
            <td style="padding:0 4px 16px;font-family:${font};font-size:15px;font-weight:600;color:#111827;">${studio}</td>
          </tr>
          <tr>
            <td class="card-pad email-body" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:32px;font-family:${font};font-size:15px;line-height:1.6;color:#1f2937;">
${params.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 4px 0;font-family:${font};font-size:12px;line-height:1.6;color:#6b7280;text-align:center;">
              ${footer}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Születés- és névnap
// ---------------------------------------------------------------------------

/** Ennyi napra visszamenőleg pótol az ütemező (pl. ha a szerver aludt a nap nagy részében). */
export const EMAIL_AUTOMATION_CATCHUP_DAYS = 2;
/** A köszöntők a stúdió idő szerint ekkortól mennek ki (éjfélkor nem). */
export const EMAIL_AUTOMATION_SEND_HOUR = 8;

export interface MonthDay {
  month: number;
  day: number;
}

/** A születési dátum hónap-napja a tárolt formából (UTC éjfél vagy `YYYY-MM-DD`), időzóna-váltás nélkül. */
export function birthMonthDay(birthDate: Date | string | null | undefined): MonthDay | null {
  if (!birthDate) return null;
  const iso = typeof birthDate === 'string' ? birthDate : birthDate.toISOString();
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  return isValidMonthDay(month, day) ? { month, day } : null;
}

/** A névnap `MM-DD` alakban (pl. `07-26`); hibás értéknél `null`. */
export function parseNameDay(nameDay: string | null | undefined): MonthDay | null {
  const match = /^(\d{2})-(\d{2})$/.exec(nameDay?.trim() ?? '');
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  return isValidMonthDay(month, day) ? { month, day } : null;
}

function isValidMonthDay(month: number, day: number): boolean {
  if (!Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(2024, month, 0)).getUTCDate();
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Erre a napra esik-e az évforduló; a február 29-i nem szökőévben február 28-án van. */
export function isAnniversaryOn(monthDay: MonthDay | null, date: CalendarDay): boolean {
  if (!monthDay) return false;
  if (monthDay.month === 2 && monthDay.day === 29 && !isLeapYear(date.year)) {
    return date.month === 2 && date.day === 28;
  }
  return date.month === monthDay.month && date.day === monthDay.day;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const budapestHourFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: STUDIO_TIME_ZONE,
  hour: '2-digit',
  hourCycle: 'h23',
});

function studioHour(date: Date): number {
  return Number(budapestHourFormat.format(date));
}

function addCalendarDays(day: CalendarDay, delta: number): CalendarDay {
  const date = new Date(Date.UTC(day.year, day.month - 1, day.day) + delta * DAY_MS);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function dayKey(day: CalendarDay): number {
  return day.year * 10_000 + day.month * 100 + day.day;
}

/**
 * Azok a stúdiónapok, amelyekre az ütemező most köszöntőt küldhet: a mai (8 órától) és az előző
 * `catchupDays` nap, de csak az automatizmus bekapcsolásának napjától. Az ismételt futást a
 * `dedupeKey` (vendég + automatizmus + év) teszi ártalmatlanná.
 */
export function automationDays(
  now: Date,
  enabledAt: Date | string | null,
  catchupDays: number = EMAIL_AUTOMATION_CATCHUP_DAYS,
): CalendarDay[] {
  if (!enabledAt) return [];
  const today = getStudioDate(now);
  const since = dayKey(getStudioDate(enabledAt));
  const days: CalendarDay[] = [];
  for (let offset = catchupDays; offset >= 0; offset--) {
    if (offset === 0 && studioHour(now) < EMAIL_AUTOMATION_SEND_HOUR) continue;
    const day = addCalendarDays(today, -offset);
    if (dayKey(day) >= since) days.push(day);
  }
  return days;
}

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A stúdió (Budapest) naptári napjának kezdete (`ÉÉÉÉ-HH-NN`); éjfélkor nincs óraátállítás. */
export function studioDayStart(day: string): Date | null {
  const match = DAY_PATTERN.exec(day);
  if (!match) return null;
  const utcMidnight = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Date(utcMidnight - studioHour(new Date(utcMidnight)) * 60 * 60 * 1000);
}

/** A napló dátumszűrője: `from` napjának elejétől `to` napjának végéig (mindkettő a stúdió napja). */
export function studioDayRange(from?: string, to?: string): { gte?: Date; lt?: Date } {
  const range: { gte?: Date; lt?: Date } = {};
  const start = from ? studioDayStart(from) : null;
  if (start) range.gte = start;
  const end = to ? studioDayStart(to) : null;
  if (end) {
    const next = addCalendarDays(getStudioDate(new Date(end.getTime() + 12 * 60 * 60 * 1000)), 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    range.lt = studioDayStart(`${next.year}-${pad(next.month)}-${pad(next.day)}`)!;
  }
  return range;
}

/** A dupla küldést kizáró kulcs (`message_logs.dedupe_key`, egyedi). */
export function automationDedupeKey(
  kind: EmailAutomationKind,
  guestId: string,
  occurrence?: CalendarDay,
): string {
  return kind === EmailAutomationKind.WELCOME
    ? `${kind}:${guestId}`
    : `${kind}:${guestId}:${occurrence?.year ?? ''}`;
}

// ---------------------------------------------------------------------------
// Csoportos küldés szűrője
// ---------------------------------------------------------------------------

/**
 * Bérletállapot a szűrőben:
 * - `ANY`: mindegy (szolgáltatással: volt valaha ilyen bérlete / tagsága);
 * - `CURRENT`: van érvényes (aktív vagy még nem kezdődött) bérlete, vagy aktív tagsága;
 * - `LAPSED`: volt, de most nincs érvényes (lejárt, elfogyott, szünetel, megszűnt);
 * - `NEVER`: soha nem volt bérlete vagy tagsága.
 */
export type AudiencePassState = 'ANY' | 'CURRENT' | 'LAPSED' | 'NEVER';

export interface EmailAudienceFilter {
  /** Ezek közül legalább egy szolgáltatáshoz kötődő bérlet / tagság. Üres: mindegy. */
  serviceIds?: string[];
  passState?: AudiencePassState;
  /** Utolsó látogatás: az elmúlt N napban járt (`WITHIN`), vagy N napja nem járt (`NOT_WITHIN`). */
  lastVisit?: { mode: 'WITHIN' | 'NOT_WITHIN'; days: number } | null;
}

/** Egy bérlet vagy tagság a szűréshez (a sztornózott bérlet nem számít). */
export interface AudienceEntitlement {
  serviceId: string | null;
  /** Érvényes: aktív vagy még nem kezdődött bérlet, illetve aktív tagság. */
  current: boolean;
}

export interface AudienceCandidate {
  entitlements: AudienceEntitlement[];
  lastVisitAt: Date | string | null;
}

export function matchesAudienceFilter(
  candidate: AudienceCandidate,
  filter: EmailAudienceFilter,
  now: Date = new Date(),
): boolean {
  const serviceIds = filter.serviceIds?.filter(Boolean) ?? [];
  const forService = (e: AudienceEntitlement) =>
    serviceIds.length === 0 || (e.serviceId !== null && serviceIds.includes(e.serviceId));
  const all = candidate.entitlements;

  switch (filter.passState ?? 'ANY') {
    case 'CURRENT':
      if (!all.some((e) => e.current && forService(e))) return false;
      break;
    case 'LAPSED':
      if (all.some((e) => e.current) || !all.some(forService)) return false;
      break;
    case 'NEVER':
      if (all.length > 0) return false;
      break;
    default:
      if (serviceIds.length > 0 && !all.some(forService)) return false;
  }

  const lastVisit = filter.lastVisit;
  if (lastVisit && lastVisit.days > 0) {
    const threshold = now.getTime() - lastVisit.days * DAY_MS;
    const visitedAt = candidate.lastVisitAt ? new Date(candidate.lastVisitAt).getTime() : null;
    const visitedWithin = visitedAt !== null && visitedAt >= threshold;
    if (lastVisit.mode === 'WITHIN' ? !visitedWithin : visitedWithin) return false;
  }
  return true;
}

/** Miért nem kap levelet a szűrőnek megfelelő vendég (a csoportos küldés előnézetében). */
export type AudienceExclusion = 'NO_EMAIL' | 'NO_CONSENT';

/** Marketing levél csak hozzájárulással és címmel; a leiratkozás visszavonja a hozzájárulást. */
export function marketingExclusion(guest: {
  email: string | null;
  marketingConsent?: boolean | null;
  unsubscribedAt?: Date | string | null;
}): AudienceExclusion | null {
  if (!guest.email?.trim()) return 'NO_EMAIL';
  if (!guest.marketingConsent || guest.unsubscribedAt) return 'NO_CONSENT';
  return null;
}

// ---------------------------------------------------------------------------
// Kimenő sor
// ---------------------------------------------------------------------------

/** Ennyi próbálkozás után a levél végleg hibás. */
export const EMAIL_MAX_ATTEMPTS = 5;
/** Az alapértelmezett óránkénti korlát (SendPulse teszt csomag: 10 levél / óra). */
export const DEFAULT_MAIL_HOURLY_LIMIT = 10;

/** Visszalépő várakozás a következő próbálkozásig: 5, 10, 20, 40 perc, legfeljebb 2 óra. */
export function emailRetryDelayMs(attempt: number): number {
  const minutes = Math.min(5 * 2 ** Math.max(0, attempt - 1), 120);
  return minutes * 60 * 1000;
}
