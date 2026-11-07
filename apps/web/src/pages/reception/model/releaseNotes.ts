/**
 * Újdonságok (Release Notes) — az „Újdonságok” menüpont egyetlen adatforrása.
 *
 * Szabályok (részletesen: docs/WORKFLOW.md → „Újdonságok bejegyzés”):
 * - Minden bejegyzéshez kötelező a Jira jegy azonosító (`jiraKey`, pl. `KAN-12`),
 *   hogy a változás visszakövethető legyen. `null` csak a Jira előtti (≤ v0.2) tételeknél.
 * - Navigációs link (`link`) KIZÁRÓLAG `NEW_FEATURE` / `NEW_PAGE` típusnál adható meg,
 *   és csak akkor, ha az új funkció a felületen ténylegesen megtekinthető.
 *   `IMPROVEMENT` / `FIX` típusnál csak szöveges leírás van — ezt a típus is kikényszeríti.
 * - Legújabb bejegyzés kerül a tömb elejére.
 */

export type ReceptionMainTab = 'desk' | 'guests' | 'finance' | 'admin';

export type ReleaseNoteLink =
  | { type: 'receptionTab'; tab: ReceptionMainTab; label: string }
  | { type: 'route'; path: string; label: string };

interface ReleaseNoteBase {
  /** Stabil, egyedi azonosító — az olvasottság-jelölés erre épül, utólag ne módosítsd. */
  id: string;
  version: string;
  /** ISO dátum (YYYY-MM-DD) */
  date: string;
  title: string;
  summary: string;
  details?: string[];
  /** Jira jegy kulcs (pl. `KAN-12`). `null` csak a Jira bevezetése előtti tételeknél. */
  jiraKey: string | null;
}

interface LinkableReleaseNote extends ReleaseNoteBase {
  kind: 'NEW_FEATURE' | 'NEW_PAGE';
  /** Csak ha az új funkció/oldal a felületen ténylegesen megtekinthető. */
  link?: ReleaseNoteLink;
}

interface DescriptionOnlyReleaseNote extends ReleaseNoteBase {
  kind: 'IMPROVEMENT' | 'FIX';
  link?: never;
}

export type ReleaseNote = LinkableReleaseNote | DescriptionOnlyReleaseNote;
export type ReleaseNoteKind = ReleaseNote['kind'];

export const RELEASE_NOTE_KIND_LABELS: Record<ReleaseNoteKind, string> = {
  NEW_PAGE: 'Új oldal',
  NEW_FEATURE: 'Új funkció',
  IMPROVEMENT: 'Fejlesztés',
  FIX: 'Javítás',
};

const JIRA_BASE_URL = (
  (import.meta.env.VITE_JIRA_BASE_URL as string | undefined) ||
  'https://reformstudiosync.atlassian.net'
).replace(/\/+$/, '');

export const countUnseenReleaseNotes = (seenIds: string[]): number =>
  RELEASE_NOTES.filter((n) => !seenIds.includes(n.id)).length;

export const getJiraIssueUrl = (jiraKey: string): string =>
  `${JIRA_BASE_URL}/browse/${encodeURIComponent(jiraKey)}`;

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    id: 'v0.2-global-scanner-channel',
    version: '0.2',
    date: '2026-10-22',
    kind: 'NEW_FEATURE',
    title: 'Globális 2D QR-kód és vonalkód szkenner csatorna',
    summary:
      'A fizikai QR/vonalkód olvasó minden megnyitott oldalon működik, fókusztól függetlenül.',
    details: [
      'Input Stealth Guard: a gépi beolvasás nem íródik bele a keresőmezőkbe.',
      'Magyar (HU QWERTZ) billentyűzet-korrekció és URL/JSON/előtag felismerés.',
      'A fejlécben 1 kattintással szüneteltethető a csatorna.',
    ],
    jiraKey: null,
    link: { type: 'receptionTab', tab: 'desk', label: 'Megnyitás a Recepciós Pulton' },
  },
  {
    id: 'v0.2-monitor-pairing',
    version: '0.2',
    date: '2026-10-22',
    kind: 'NEW_FEATURE',
    title: 'Dual-Mode Vendégmonitor és 6 jegyű tablet párosítás',
    summary:
      'A monitor működhet a recepciós PC másodlagos kijelzőjén, vagy önálló tableten 10 percig érvényes párosító kóddal.',
    details: [
      'Eszközmenedzsment: átnevezés, új kód, leválasztás, Teszt Jel küldése.',
    ],
    jiraKey: null,
    link: { type: 'receptionTab', tab: 'admin', label: 'Monitorok & párosítás megnyitása' },
  },
  {
    id: 'v0.2-visit-types',
    version: '0.2',
    date: '2026-10-22',
    kind: 'NEW_FEATURE',
    title: 'Köredzés vs. alkalmas kezelés, adatvédett monitor',
    summary:
      'Köredzésnél nincs alkalomlevonás, alkalmas kezelésnél dedikált ablakban választható a kezelés és a bérlet.',
    details: [
      'A Vendégmonitoron soha nem jelenik meg tartozás vagy pénzügyi adat.',
      'Az üdvözlés megjelenítési ideje 3–30 mp között állítható.',
    ],
    jiraKey: null,
    link: { type: 'receptionTab', tab: 'desk', label: 'Megnyitás a Recepciós Pulton' },
  },
  {
    id: 'v0.2-memberships-finance',
    version: '0.2',
    date: '2026-10-22',
    kind: 'NEW_FEATURE',
    title: 'Havi tagságok és pénzügyi allokáció',
    summary:
      'Havi tagságok kezelése, hátralék-kategóriák (1–5, 6–15, 15+ nap), részbefizetés és célzott befizetés.',
    jiraKey: null,
    link: { type: 'receptionTab', tab: 'finance', label: 'Pénzügy & Tartozások megnyitása' },
  },
  {
    id: 'v0.2-guest-file',
    version: '0.2',
    date: '2026-10-22',
    kind: 'NEW_FEATURE',
    title: 'Bővített vendégkartoték',
    summary:
      'Testmérések naplózása, automatikus WebP képoptimalizálás, belső megjegyzések és e-mail napló.',
    jiraKey: null,
    link: { type: 'receptionTab', tab: 'guests', label: 'Vendégkartoték megnyitása' },
  },
  {
    id: 'v0.2-tablet-signing',
    version: '0.2',
    date: '2026-10-22',
    kind: 'NEW_PAGE',
    title: 'Tablet aláíró felület (/tablet)',
    summary: 'Dedikált aláíró oldal GDPR és állapotfelmérő ívekhez.',
    jiraKey: null,
    link: { type: 'route', path: '/tablet', label: 'Tablet felület megnyitása' },
  },
  {
    id: 'v0.2-daily-dashboard',
    version: '0.2',
    date: '2026-10-22',
    kind: 'NEW_FEATURE',
    title: 'Napi műszerfal',
    summary:
      'Születés- és névnapos vendégek, lejáró bérletek és szolgáltatás-megoszlás egy helyen.',
    jiraKey: null,
    link: { type: 'receptionTab', tab: 'desk', label: 'Megnyitás a Recepciós Pulton' },
  },
  {
    id: 'v0.2-duplicate-scan-cooldown',
    version: '0.2',
    date: '2026-10-22',
    kind: 'IMPROVEMENT',
    title: 'Gyorsabb dupla-leolvasás védelem',
    summary:
      'A véletlen dupla csippantás védelmi ablaka 60 mp-ről 10 másodpercre csökkent, 1 kattintásos felülbírálással.',
    jiraKey: null,
  },
  {
    id: 'v0.2-dark-mode-contrast',
    version: '0.2',
    date: '2026-10-22',
    kind: 'IMPROVEMENT',
    title: 'Sötét mód kontrasztjavítások',
    summary: 'Kártyák, státusz-jelvények és gombok jobb olvashatósága sötét témában.',
    jiraKey: null,
  },
];
