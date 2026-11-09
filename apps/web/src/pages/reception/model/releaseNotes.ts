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
    id: 'v0.3-pass-occasion-consistency',
    version: '0.3',
    date: '2026-11-09',
    kind: 'FIX',
    title: 'Pontos alkalomszám sztornó és visszavonás után',
    summary:
      'A bérlet hátralévő alkalmai mindig a ténylegesen levont, vissza nem vont kezelésekből számolódnak, így sztornó vagy visszavonás után sem csúsznak el.',
    details: [
      'Ugyanaz a kezelés csak egyszer írható jóvá: a beléptetés sztornója és a levonás visszavonása egymást is lezárja, a napi érkezésekből is kikerül.',
      'Kezelés csak olyan bérletről vonható le, amely arra a szolgáltatásra szól és már elkezdődött.',
      'Egy későbbi részletfizetés sztornója nem tiltja le a bérletet, csak az eladási befizetésé.',
      'A vendég „Kezelések” fülén csak a levonások látszanak; a vásárlás, hosszabbítás és fagyasztás a „Bérletek” fül „Bérlet-előzmények” részébe került, visszavonó gomb nélkül.',
      'A bérlet állapota (aktív, lejárt, elfogyott, fagyasztott, még nem kezdődött, sztornózva) a lejárat napjának végéig pontos.',
      'Minden sztornó és visszavonás naplózva van: ki, mikor, miért.',
    ],
    jiraKey: 'TICKET-16',
  },
  {
    id: 'v0.3-monthly-dues-generation',
    version: '0.3',
    date: '2026-11-08',
    kind: 'FIX',
    title: 'Havi tagdíjak automatikus esedékessége',
    summary:
      'A havi tagdíjak minden hónapban automatikusan esedékessé válnak, így a tartozások és a késési kategóriák (1–5, 6–15, 15+ nap) pontosak.',
    details: [
      'A hónap tagdíja a hónap elejétől látszik a vendég adatlapján, és előre is befizethető.',
      'Ha a tagság a havi esedékességi nap után indul, az első tagdíj a következő hónapban esedékes, így új tag nem indul tartozással.',
      'Szüneteltetett vagy megszűnt tagságra nem keletkezik új tagdíj; újraaktiváláskor a következő esedékes hónaptól folytatódik.',
    ],
    jiraKey: 'TICKET-13',
  },
  {
    id: 'v0.3-monitor-privacy-filter',
    version: '0.3',
    date: '2026-11-08',
    kind: 'FIX',
    title: 'Adatvédett vendégmonitor',
    summary:
      'A vendégmonitor soha nem mutat tartozást vagy elutasítási okot.',
    details: [
      'Elutasításnál a monitoron csak a „Kérjük, fáradj a recepcióhoz!” üzenet jelenik meg, név nélkül.',
      'A tartozás, a vonalkód és az elutasítás oka már a szerverről sem jut el a kijelzőkhöz.',
      'Ha a szerver nem érhető el, a rendszer hibaüzenetet ad, és nem dolgozik kitalált adatokkal (a /demo oldal továbbra is működik).',
    ],
    jiraKey: 'TICKET-17',
  },
  {
    id: 'v0.3-unified-error-messages',
    version: '0.3',
    date: '2026-11-08',
    kind: 'IMPROVEMENT',
    title: 'Egységes hibaüzenetek',
    summary:
      'A rendszer minden hibát egyformán jelez, és ha lejárt a bejelentkezés, automatikusan a belépő oldalra visz.',
    details: [
      'A hibaüzenetek szövege nem változott, de mostantól minden oldalon ugyanúgy jelennek meg.',
      'Lejárt bejelentkezésnél nem kell kézzel kilépni: a rendszer kiléptet, és a belépő oldalra irányít.',
      'Offline módban a beléptetés továbbra is a helyi pufferbe kerül.',
    ],
    jiraKey: 'TICKET-9',
  },
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
