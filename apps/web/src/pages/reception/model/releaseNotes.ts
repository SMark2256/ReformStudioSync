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

/** Az Újdonságok szűrője: az „Új oldal” az „Új funkció” csoportba tartozik. */
export type ReleaseNoteFilter = 'all' | 'feature' | 'improvement' | 'fix';

export const RELEASE_NOTE_FILTERS: {
  value: ReleaseNoteFilter;
  label: string;
}[] = [
  { value: 'all', label: 'Mind' },
  { value: 'feature', label: 'Új funkció' },
  { value: 'improvement', label: 'Fejlesztés' },
  { value: 'fix', label: 'Javítás' },
];

const RELEASE_NOTE_KIND_FILTER: Record<
  ReleaseNoteKind,
  Exclude<ReleaseNoteFilter, 'all'>
> = {
  NEW_PAGE: 'feature',
  NEW_FEATURE: 'feature',
  IMPROVEMENT: 'improvement',
  FIX: 'fix',
};

export const matchesReleaseNoteFilter = (
  note: ReleaseNote,
  filter: ReleaseNoteFilter,
): boolean =>
  filter === 'all' || RELEASE_NOTE_KIND_FILTER[note.kind] === filter;

export const isReleaseNoteFilter = (
  value: string,
): value is ReleaseNoteFilter =>
  RELEASE_NOTE_FILTERS.some((f) => f.value === value);

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
    id: 'v0.3-guest-sheet-arrivals',
    version: '0.3',
    date: '2026-11-11',
    kind: 'IMPROVEMENT',
    title: 'Belépések a vendégadatlapon',
    summary: 'A vendégadatlapon látszanak a belépések.',
    details: [
      'Az új „Belépések” fül minden belépést mutat, legújabb elöl: időpont, köredzés vagy kezelés (szolgáltatással), bérlet, rögzítő munkatárs és állapot (sikeres, sztornózott, elutasított, az okkal együtt).',
      'A tagsággal vagy időalapú bérlettel történt, levonás nélküli köredzés is megjelenik.',
      'A Bérletek fülön bérletenként lenyitható, melyik belépés kötődött az adott bérlethez.',
    ],
    jiraKey: 'TICKET-40',
  },
  {
    id: 'v0.3-fix-pass-freeze-calendar-days',
    version: '0.3',
    date: '2026-11-11',
    kind: 'FIX',
    title: 'Pontosabb bérletfagyasztás',
    summary:
      'Fagyasztás feloldásakor naptári napok szerint hosszabbodik a lejárat, és csak érvényes bérlet fagyasztható.',
    details: [
      'A lejárat annyi nappal tolódik, ahány naptári nap telt el a fagyasztás és a feloldás napja között (legalább 1 nappal).',
      'Lejárt, elfogyott vagy sztornózott bérletnél nem jelenik meg a „Fagyasztás” gomb; a fagyasztott bérlet „Feloldás” gombja mindig elérhető.',
      'A bérlet-előzményekben látszik, melyik munkatárs fagyasztotta vagy oldotta fel a bérletet.',
    ],
    jiraKey: 'TICKET-41',
  },
  {
    id: 'v0.3-fix-scan-treatment-selection',
    version: '0.3',
    date: '2026-11-11',
    kind: 'FIX',
    title: 'Alkalmas bérletnél kezelésválasztó nyílik',
    summary:
      'Alkalmas bérletnél a beolvasás után a kezelésválasztó ablak nyílik meg; nincs ingyenes köredzés.',
    jiraKey: 'TICKET-39',
  },
  {
    id: 'v0.3-whats-new-filter',
    version: '0.3',
    date: '2026-11-11',
    kind: 'IMPROVEMENT',
    title: 'Szűrhető Újdonságok',
    summary:
      'Az Újdonságok listája típus szerint szűrhető, a részletek pedig kártyánként nyithatók.',
    details: [
      'A lista fölötti kapcsolóval csak az új funkciók, a fejlesztések vagy a javítások jeleníthetők meg; a „Mind” visszahozza a teljes listát.',
      'A részletes leírás alapból rejtve van, a kártya alján a „Részletek” gombbal nyitható ki.',
    ],
    jiraKey: 'TICKET-37',
  },
  {
    id: 'v0.3-page-monitors',
    version: '0.3',
    date: '2026-11-11',
    kind: 'NEW_PAGE',
    title: 'Monitorok: külön oldal a vendégmonitoroknak',
    summary:
      'A vendégmonitorok és tabletek kezelése saját oldalt kapott, amelyet a nevedre kattintva felnyíló panelből érsz el.',
    details: [
      'A panelben a Beállítások fölött van a Monitorok menüpont; jobb szélén látod, hány monitor kapcsolódik éppen.',
      'Itt párosíthatsz új tabletet 6 jegyű kóddal, küldhetsz teszt jelet, és nyithatod meg a Vendégmonitort új ablakban. A Bérletek és termékek oldalról ez a rész kikerült.',
    ],
    jiraKey: 'TICKET-38',
    link: { type: 'route', path: '/monitors', label: 'Monitorok megnyitása' },
  },
  {
    id: 'v0.3-feat-monitor-birthday-confetti',
    version: '0.3',
    date: '2026-11-11',
    kind: 'NEW_FEATURE',
    title: 'Születésnapi köszöntés a Vendégmonitoron',
    summary:
      'Születésnapos vendégeinket konfetti köszönti a Vendégmonitoron.',
    details: [
      'Ha a vendég a születésnapján sikeresen belép (köredzésre vagy kezelésre), a Vendégmonitoron 2 másodpercig konfetti hullik, és a neve alatt megjelenik a „Boldog születésnapot!” felirat.',
      'Elutasításnál és ismételt beolvasásnál nincs konfetti és felirat. A születési dátum nem jelenik meg a monitoron.',
    ],
    jiraKey: 'TICKET-36',
  },
  {
    id: 'v0.3-login-email-code',
    version: '0.3',
    date: '2026-11-11',
    kind: 'IMPROVEMENT',
    title: 'Belépés e-mailben kapott kóddal',
    summary:
      'Jelszó helyett e-mailben kapott belépőkóddal lehet belépni. Add meg az e-mail címed, és a levélben érkező 6 jegyű kódot írd be; a kód 10 percig érvényes, és csak egyszer használható.',
    jiraKey: 'TICKET-35',
  },
  {
    id: 'v0.3-fix-monitor-live-status',
    version: '0.3',
    date: '2026-11-11',
    kind: 'FIX',
    title: 'A Vendégmonitor valós kapcsolatállapotot mutat',
    summary:
      'A Vendégmonitor fejléce csak akkor írja, hogy „Élő Socket + Helyi Szinkron Aktív”, ha a szerver ténylegesen fogadta a kijelzőt; kapcsolódás közben „Kapcsolódás a szerverhez…”, kapcsolat nélkül „Csak helyi szinkron” látszik. Ha a párosítást a recepción bontod, vagy a szerver már nem ismeri a kijelzőt, a monitor azonnal újra a 6 jegyű párosító kódot kéri.',
    jiraKey: 'TICKET-32',
  },
  {
    id: 'v0.3-fix-monitor-revoked-disconnect',
    version: '0.3',
    date: '2026-11-11',
    kind: 'FIX',
    title: 'A törölt kijelző azonnal lekapcsolódik',
    summary:
      'Ha egy Vendégmonitort törölsz, vagy új párosító kódot kérsz hozzá, a kijelző kapcsolata azonnal megszűnik: a recepción már nem látszik online-nak, és nem számít bele az „Online (N kijelző)” számba.',
    jiraKey: 'TICKET-31',
  },
  {
    id: 'v0.3-fix-monitor-display-count',
    version: '0.3',
    date: '2026-11-11',
    kind: 'FIX',
    title: 'Helyes kijelzőszám a recepción',
    summary:
      'Az eszközsor „Online (N kijelző)” felirata már csak a ténylegesen kapcsolódó Vendégmonitorokat számolja: a recepciós fülek nem számítanak bele, és a szám nem nő magától. Ha egy kijelző sem kapcsolódik, 0 látszik.',
    jiraKey: 'TICKET-30',
  },
  {
    id: 'v0.3-fix-monitor-stable-connection',
    version: '0.3',
    date: '2026-11-11',
    kind: 'FIX',
    title: 'A Vendégmonitor megbízhatóan megjeleníti a beléptetett vendéget',
    summary:
      'A Vendégmonitor és a recepció tartósan kapcsolódva marad a szerverhez, nem csatlakozik újra folyamatosan. A beléptetett vendég üdvözlése így nem vész el útközben, és a kapcsolat nem terheli feleslegesen a kijelzőt.',
    jiraKey: 'TICKET-29',
  },
  {
    id: 'v0.3-sidebar-settings',
    version: '0.3',
    date: '2026-11-11',
    kind: 'NEW_FEATURE',
    title: 'Új oldalsáv és Beállítások: téma és felületszín',
    summary:
      'A bal oldali menü sötét, lebegő kártya lett. A nevedre kattintva felcsúszó panelből éred el a Beállításokat, a téma kapcsolót és a kijelentkezést. A Beállításokban a téma mellett a felület színét is kiválaszthatod.',
    details: [
      'Ikonsávra csukva az egeret a menü fölé húzva kinyílik a tartalom fölött, és elhagyva visszacsukódik. A választás (nyitva vagy ikonsáv) keskeny és széles képernyőn külön mentődik.',
      'Hat felületszín közül választhatsz (Kékeszöld, Kék, Indigó, Bordó, Borostyán, Olajzöld); a gombok, az aktív menüpont és a jelölők ehhez igazodnak, világos és sötét témában is.',
      'A téma és a felületszín ezen a gépen mentődik, és újratöltés után villanás nélkül megmarad. A Vendégmonitor megjelenése nem változik.',
      'A menü alján látszik a futó verzió; rákattintva az Újdonságok nyílnak meg.',
    ],
    jiraKey: 'TICKET-28',
    link: { type: 'route', path: '/settings', label: 'Beállítások megnyitása' },
  },
  {
    id: 'v0.3-fix-deduct-treatment-feedback',
    version: '0.3',
    date: '2026-11-11',
    kind: 'FIX',
    title: 'A kezeléslevonás jelzi, ha valami hiányzik',
    summary:
      'Az „1 Alkalom Levonása & Üdvözlés” gomb már nem marad csendben: ha nincs kiválasztott vendég, kezelés vagy bérlet, a mező alatt megjelenik, mi hiányzik. Ha még egyetlen kezelés sincs felvéve, az ablak ezt külön jelzi, és megmondja, hol lehet kezelést felvenni.',
    jiraKey: 'TICKET-27',
  },
  {
    id: 'v0.3-fix-payment-round-amount',
    version: '0.3',
    date: '2026-11-11',
    kind: 'FIX',
    title: 'Befizetés kerek összeggel is rögzíthető',
    summary:
      'A Befizetés rögzítése ablakban bármilyen pozitív, egész forintösszeg megadható, így a havi tagdíj és a kerek összegek (pl. 3 000 Ft) is rögzíthetők. Érvénytelen összegnél (pl. 0 Ft vagy üres mező) a mező alatt hibaüzenet jelenik meg.',
    jiraKey: 'TICKET-25',
  },
  {
    id: 'v0.3-ui-finance-passes-news',
    version: '0.3',
    date: '2026-11-11',
    kind: 'IMPROVEMENT',
    title: 'Megújult Pénzügy, Bérletek és termékek, Újdonságok, bejelentkezés és demó',
    summary:
      'Ezek az oldalak is az új, nyugodtabb felületet kapták: egységes kártyák, táblázatok, gombok és ablakok, világos és sötét témában is jól olvashatóan. A működésük nem változott.',
    details: [
      'Pénzügy: felül a napi kassza négy összesítője, alatta a lejárt tagdíjak és a mai tranzakciók táblázata. A fizetés sztornója előtt megerősítést kér a rendszer.',
      'Bérletek és termékek: a bérletsablonok és a szolgáltatások táblázatban, alattuk az új tétel űrlapja. A vendégmonitorok párosítása ugyanitt van; a párosítás bontása és a kijelző törlése megerősítést kér.',
      'A bérleteladás, a befizetés rögzítése és a kezeléslevonás ablaka egységes fejlécet, görgethető törzset, alul Mégse és megerősítő gombot kapott; telefonon teljes képernyős.',
      'A bejelentkezés, a demó oldal és a v0.2 kiadási jegyzék az új stílust követi. A Vendégmonitor megtartja a fix sötét megjelenését, színátmenetek nélkül.',
    ],
    jiraKey: 'TICKET-24',
  },
  {
    id: 'v0.3-guests-new-ui',
    version: '0.3',
    date: '2026-11-11',
    kind: 'IMPROVEMENT',
    title: 'Megújult Vendégek oldal és vendégadatlap',
    summary:
      'A Vendégek oldal áttekinthető táblázatot kapott: kártyaszám, név, telefon, bérlet, fennmaradó alkalmak, lejárat és állapot egy sorban. Egy sorra kattintva megnyílik a vendég adatlapja.',
    details: [
      'Szűrő a lista fölött: Mind, Érvényes, Hamarosan lejár, Lejárt / elfogyott; mellette a találatok száma.',
      'A kártya, a kezelés levonása és a bérlet eladása a sor végi menüből érhető el.',
      'A vendégadatlap az új felületi stílust követi, világos és sötét témában is; a levonás visszavonása megerősítést kér.',
      'Telefonon a táblázat helyett soronként egy kártya látszik.',
    ],
    jiraKey: 'TICKET-23',
  },
  {
    id: 'v0.3-reception-desk-new-ui',
    version: '0.3',
    date: '2026-11-11',
    kind: 'IMPROVEMENT',
    title: 'Megújult Recepció oldal',
    summary:
      'A Recepció nyugodtabb, egységes kinézetet kapott: felül a gyorsműveletek és a napi összesítő, alatta két oszlopban a beolvasás, az utoljára azonosított vendég, a vendégkereső, a mai kassza és a mai érkezések.',
    details: [
      'Az Új vendég, a Beléptetés, az Alkalom levonása, az Új bérlet és a Befizetés gomb az oldal címe mellett van.',
      'A napi összesítő négy számot mutat: mai forgalom, mai bevétel, lejárt tagdíjak és lejáró bérletek. A mai ünnepeltek alatta, külön sorban látszanak.',
      'A beléptetés állapotát (Sikeres, Dupla leolvasás, Elutasítva, Visszavonva) jelvény mutatja, a működés nem változott.',
      'Világos és sötét témában, telefonon és tableten is jól olvasható.',
    ],
    jiraKey: 'TICKET-22',
  },
  {
    id: 'v0.3-app-shell-sidebar',
    version: '0.3',
    date: '2026-11-11',
    kind: 'IMPROVEMENT',
    title: 'Új oldalsó menü és fejléc',
    summary:
      'A felső fülsor helyett bal oldali menüből éred el a Recepciót, a Vendégeket, a Bérleteket és termékeket és a Pénzügyet. Minden résznek saját címe van, így könyvjelzőzhető, és frissítés után is ugyanott maradsz.',
    details: [
      'A menü összecsukható ikonsávvá (Ctrl+B), tableten alapból így látszik; telefonon a fejléc menü gombjával nyílik.',
      'A Vendégmonitor a menüből külön ablakban nyílik, ahogy eddig a felső gombbal.',
      'Az Újdonságok és a Demó mód a menü alján van; az Újdonságok mellett látszik az olvasatlan bejegyzések száma.',
      'A kijelentkezés a menü alján, a nevedre kattintva érhető el. A téma gomb és a dátum a fejlécben maradt.',
      'A szkenner, az offline mód és a hang kapcsolója, valamint a Tablet Aláíró a recepció tetején található.',
    ],
    jiraKey: 'TICKET-21',
  },
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

/** A futó verzió: a legújabb bejegyzésé (az oldalsáv alján látszik). */
export const CURRENT_VERSION = RELEASE_NOTES[0].version;
