# ReformStudioSync — Technikai Architektúra és Tervezési Döntések (ADR)

## 1. Rendszeráttekintés

A **ReformStudioSync** egy egystúdiós (de `studioId` szinten többstúdiós SaaS modellre felkészített) recepciós, pénzügyi és valós idejű vendégmonitor webalkalmazás, amelynek célja a **0 Ft / hó** fix felhő-infrastruktúra költség (Supabase Free Tier + Render Hobby Tier + Cloudflare Workers Free Tier + UptimeRobot).

### 1.1. Monorepo Felépítés

- **`packages/shared` (`@reform/shared`):** Közös TypeScript szerződések, Enumok (`Role`, `PassType`, `PaymentMethod`, `CheckInStatus`), REST DTO interfészek és Socket.io esemény-definíciók (`SOCKET_EVENTS`, `CheckInResultPayload`, `CheckInRevokedPayload`).
- **`apps/api` (`@reform/api`):** NestJS 10 REST API + Socket.io WebSocket Gateway (`/monitor` névtér) + Prisma ORM + Swagger/OpenAPI (`/api/docs`).
- **`apps/web` (`@reform/web`):** React 18 + Vite + Tailwind CSS + TanStack Query v5 + Zustand + Sonner Toast értesítési réteg + Kliensoldali Mock Sandbox motor (`shared/api/mock-engine.ts`). A frontend a [Feature-Sliced Design](https://feature-sliced.design) módszertan szerint épül fel (lásd 1.2). Unit tesztek: Vitest + Testing Library, jsdom környezetben (`src/**/*.test.ts(x)`, `npm --workspace=@reform/web run test`, a gate része).
- **`e2e/` + `playwright.config.ts`:** Playwright böngészős tesztek mock-módban: a web nem elérhető API-címmel és `VITE_DEMO_MODE=true`-val buildelve (`.e2e-dist/`, `vite preview`) a mock motorra esik vissza, így API és adatbázis nélkül futnak (`npm run test:e2e`, részletek: `e2e/README.md`). A gate-nek nem része.

### 1.2. Frontend Rétegek (Feature-Sliced Design)

Az `apps/web/src` könyvtár rétegei felülről lefelé. Egy réteg csak az alatta lévő rétegekből importálhat, és minden slice-t csak a saját `index.ts` publikus API-ján keresztül lehet elérni (`@/features/sell-pass`, nem `@/features/sell-pass/ui/...`).

| Réteg | Slice-ok | Tartalom |
| :--- | :--- | :--- |
| `app/` | — | Belépési pont (`index.tsx`), QueryClient + Toaster providerek, router (`App.tsx`), globális stílusok |
| `pages/` | `login`, `reception`, `monitor`, `monitors`, `settings`, `tablet-document`, `guest-intake`, `tablet-intake`, `demo-sandbox` | Útvonalanként egy oldal |
| `widgets/` | `guest-profile`, `version-changelog` | Önálló, összetett UI blokkok |
| `features/` | `scanner-channel`, `sell-pass`, `deduct-treatment`, `record-payment`, `toggle-theme`, `guided-tour` | Felhasználói műveletek (`guided-tour`: oldalbemutató — felajánlás, reflektoros réteg, fejléc „?” gomb; forgatókönyv minden alkalmazásoldalon, kivéve a Demót és a Monitorokat (`config/tours.ts`); a célpontok `data-tour` horgonyok az oldalakon, a kötelezőket az `e2e/tour-targets.spec.ts` ellenőrzi; újdonság-reflektor: a `ReleaseNote.spotlight` 45 napig egy lépéses bemutatóként felajánlva, látott-állapota `spotlight:<bejegyzés id>`) |
| `entities/` | `guest`, `check-in`, `display-device`, `intake`, `release-note` | Üzleti entitások UI-ja és állapota (offline puffer, szkenner csatorna store, kijelzőlista lekérdezése, vendégfelvétel lekérdezései és aláírt PDF-ek, Újdonságok adatai) |
| `shared/` | `api`, `auth`, `config`, `theme`, `lib/*` | REST kliens + mock motor, session store, útvonalak és a futó verzió (`config`), téma store, notify/sound/szkenner/monitor csatorna segédek |

A szabályokat a [Steiger](https://github.com/feature-sliced/steiger) linter ellenőrzi: `npm run lint:fsd`. A TypeScript- és React-szabályokat az ESLint (`eslint.config.mjs`) a teljes monorepón: `npm run lint` / `npm run lint:fix`.

**UI-irány:** a felület kinézetét és viselkedését (shadcn/ui alap, tokenek, alkalmazáskeret, komponensek a `shared/ui`-ban, oldalak) a [`reformstudio-ui-skill`](../.claude/skills/reformstudio-ui-skill/SKILL.md) határozza meg; minden felületi munkánál ez a mérvadó.

---

## 2. Architektúra Döntések (ADR) és Alapterv-Javítások

### ADR-01: Atomi Feltételes Alkalomlevonás és 10 mp-es Dupla Lehúzás Védelem
- **Kontextus:** Fizikai USB vonalkódolvasóknál gyakori a véletlen dupla csippantás, vagy párhuzamos kérések beérkezése.
- **Megoldás:**
  1. **Cooldown védelem (`DUPLICATE_SCAN_COOLDOWN_SECONDS = 10`):** Ha ugyanazt a kártyát 10 másodpercen belül újra beolvassák (`forceDuplicate !== true`), a rendszer nem von le újabb alkalmat, hanem `DUPLICATE_SCAN` státuszt ad vissza. A recepciós a Toast üzenetben található *"Mégis levonás (+1 fő)"* gombbal felülbírálhatja. (Korábban 60 mp volt; a fogadóélmény miatt 10 mp-re csökkentve.)
  2. **Adatbázis-szintű atomi feltétel (`updateMany`):** Alkalom alapú (`OCCASION_BASED`) bérletnél a levonás `where: { id: activePass.id, isActive: true, isFrozen: false, remainingPasses: { gt: 0 } }` feltétellel fut le, és a tranzakció ellenőrzi, hogy `atomicUpdate.count === 1`. Így a bérlet egyenlege soha nem mehet negatívba.

### ADR-02: Post-Commit WebSocket Eseményküldés
- **Kontextus:** Az eredeti példakódban a WebSocket `emitCheckInResult` a `prisma.$transaction` callbacken belül futott le.
- **Megoldás:** A `CheckInsService` minden állapotváltozást (beleértve a `DENIED` elutasítások naplózását is) véglegesít a tranzakcióban, és a `monitorGateway.emitCheckInResult(...)` hívás **kizárólag a tranzakció sikeres commitja után** történik meg.

### ADR-03: Determinisztikus Bérlet-Priorizálás és beolvasási döntés (TICKET-39)
- **Szabályok** (egyetlen forrás: `resolveArrivalEntitlement`, `packages/shared/src/pass-rules.ts`; az API és a mock is ezt hívja):
  1. Csak a számolt állapot szerint aktív (`getPassStatus === ACTIVE`) bérletek vehetők figyelembe.
  2. Aktív havi tagság, vagy köredzésre érvényes `TIME_BASED` bérlet (nincs szolgáltatáshoz kötve, vagy a szolgáltatása `CIRCUIT` kategóriájú) → köredzés belépés, 0 levonás.
  3. Különben, ha van érvényes bérlet (alkalmas, vagy nem köredzés szolgáltatáshoz kötött) → `TREATMENT_SELECTION_REQUIRED`: a beolvasás nem rögzít belépést és nem küld monitor-eseményt; a recepción a kezelésválasztó nyílik meg (a választható bérletek a **leghamarabb lejáróval** kezdődnek), a levonás és az üdvözlés a megerősítéskor (`deductTreatmentUsage`) történik. A beolvasás soha nem von le alkalmat.
  4. Semmi érvényes → elutasítás (`DENIED`, naplózva).
- **Csak nőknek szóló szolgáltatás (TICKET-42):** `Service.womenOnly` (női köredzés); a havi tagság a köredzés szolgáltatáshoz kötődik (`Membership.serviceId`, `pickCircuitMembershipService`). A döntés egyetlen forrása a `womenOnlyAccess(Guest.gender, womenOnly)` (`packages/shared/src/gender.ts`): férfi vendégnek ilyen bérlet / tagság nem adható el (`PASS.WOMEN_ONLY`), kezeléslevonás nem rögzíthető (`CHECKIN.WOMEN_ONLY`), a beolvasásnál pedig a `resolveArrivalEntitlement` nem veszi figyelembe ezeket (ha emiatt nem marad semmi: `DENIED`, `WOMEN_ONLY` ok). „Nincs megadva” nemnél engedélyezett, de a recepció `GENDER_MISSING` figyelmeztetést kap. A nem előtöltése: `inferGenderFromFirstName` (ugyanez a névlista a `guest_gender_women_only` migrációban).

### ADR-04: Dual-Mode Vendégmonitor (`BroadcastChannel` + `Socket.io` + `DisplayDevice`)
- **Másodlagos Monitor (Azonos PC):** A böngésző natív `BroadcastChannel('reform_monitor_channel')` csatornáján `< 1 ms` késleltetéssel kapja meg a beléptetési és sztornó eseményeket.
- **Önálló Eszköz (Tablet / iPad / Smart TV):** A recepción generált 6 jegyű párosító kóddal (`POST /api/auth/monitor/pair-init` -> `POST /api/auth/monitor/pair-verify`) az eszköz egy dedikált `deviceToken`-t kap, amellyel autentikálódik a `/monitor` Socket.io névtéren.
- **Adatszűrés (TICKET-17):** A monitorra csak a `toMonitorPayload` (`@reform/shared`) által szűkített `MonitorCheckInPayload` / `MonitorCheckInRevokedPayload` kerül: tartozás, vonalkód, azonosító és elutasítási ok nélkül, elutasításnál név nélkül. A gateway két szobát használ: `studio:<id>` (minden kliens; a `monitor:checkin-result` / `monitor:checkin-revoked` szűkítve, a staff szoba kivételével) és `studio:<id>:staff` (csak munkatársi token, teljes `checkin:result` / `checkin:revoked`). A munkatársi tokennel megnyitott `/monitor` `displayOnly` jelzővel csatlakozik, így a staff szobába nem kerül be, és a recepciós scanner-csatornára sem iratkozik fel. A helyi `broadcastToLocalMonitors` ugyanezzel a függvénnyel szűr.
- **Szolgáltatáshoz illő üdvözlés (TICKET-43):** A `CheckInResultPayload` és a `MonitorCheckInPayload` a szolgáltatás kategóriáját (`serviceCategory`) és `womenOnly` jelzését is viszi (nem érzékeny). A címke és a jókívánság egyetlen forrása a `greetingFor` / `greetingForCheckIn` (`packages/shared/src/greeting.ts`): ezt használja a monitor, a recepciós toast, az „Utoljára azonosított vendég” kártya és a kezelésválasztó monitor-előnézete. Dupla beolvasásnál és idempotens visszajátszásnál a korábbi belépés szolgáltatása dönt.
- **Visszavonás és elutasítás (TICKET-31):** Törlés vagy új párosító kód után a `MonitorGateway.disconnectDevice` az eszköz minden socketjének közvetlenül elküldi a `monitor:device-revoked` eseményt, bontja őket, és a nyilvántartásból azonnal törli (a recepció csak az új `monitor:state` kijelzőszámot kapja). A visszavonás alatt hitelesülő, régi tokenes kapcsolat nem regisztrálhat (visszavonási sorszám). Elutasított vagy hiányzó tokennél a szerver a bontás előtt `monitor:auth-rejected` eseményt küld (`MonitorAuthRejectedPayload`: katalóguskód és -üzenet).
- **Kliensoldali kapcsolatállapot (TICKET-32):** A `useMonitorChannel` `connectionStatus`-a (`idle` / `connecting` / `live` / `offline`) csak a szerver `monitor:state` üzenete után `live` (a socket `connect` eseménye még nem jelenti, hogy a gateway beléptette a szobába); bontásnál, `connect_error`-nál és elutasításnál `offline`, és a kijelzőszám 0-ra áll. `monitor:auth-rejected` után `COMMON.INTERNAL` kódnál a hook 5 mp múlva kézzel újracsatlakozik (legfeljebb 5-ször, élő kapcsolat után újra), más kódnál nem. Eszköztokennel futó monitoron az `AUTH.DEVICE_TOKEN_INVALID` és a saját `monitor:device-revoked` törli a párosítást (kódbekérő képernyő); munkatársi munkamenetnél a párosítás marad.

### ADR-05: Állandó Recepciós Toast Visszajelző Rendszer Fókusz-Elrablás Nélkül
- A `QueryClient` `MutationCache` globális `onError` ága minden API- vagy hálózati hibát automatikusan piros Toast üzenetként (`sonner`) jelenít meg.
- Minden recepciós művelet (beléptetés, elutasítás, dupla leolvasás, bérleteladás, sztornó, vendég-mentés, bérletfagyasztás, hosszabbítás, digitális kártya letöltés) dedikált vizuális Toast visszaigazolást és szintetizált Web Audio API hangjelzést ad, miközben a `useBarcodeScanner` billentyűzet-figyelése zavartalan marad.
- **Szkenner és kézi gépelés (TICKET-5):** fókusz nélkül a `useBarcodeScanner` a gyors sorozatot (< 80 ms / leütés) a 2. karaktertől elnyeli. Szövegmezőben (input, textarea, contenteditable) menet közben semmit nem nyel el; csak az egyértelműen gépi sorozatot (≥ 6 karakter, átlag < 30 ms, `shared/lib/barcode-scanner/scanSequence.ts`) kezeli utólag beolvasásként, és React-kompatibilisen (natív setter + `input` esemény) visszaállítja a mező értékét. A `data-barcode-ignore` attribútumú mezőn (név, e-mail, megjegyzés) a figyelő semmit nem csinál; a `data-barcode-input="true"` mező saját űrlapküldéssel dolgozik.

### ADR-06: Mock fallback csak demó módban (TICKET-17)
- A `shared/api/client.ts` `request()` hálózati hibánál csak demó módban (`isDemoMode()`: `VITE_DEMO_MODE=true` build, vagy a `/demo` útvonal) vált a `mock-engine.ts`-re. Élesben `COMMON.NETWORK` hiba és toast jön, így beléptetés, levonás vagy fizetés nem dőlhet el kitalált adaton. Az E2E build `VITE_DEMO_MODE=true`-val fut.

### ADR-07: Havi Tagdíj-Esedékességek Idempotens Pótlása (TICKET-13)
- **Közös szabály:** `packages/shared/src/membership-dues.ts` tiszta függvényei (`getMembershipDueSchedule`, `getMissingDues`, `getOverdueDays`, `getOverdueBucket`) számolnak a stúdió naptára (`Europe/Budapest`) szerint; az API és a kliensoldali mock motor ugyanezt használja.
- **Ütemezés:** a folyó hónapig minden hónapnak van esedékessége (hónap elejétől befizethető). Ha a kezdés (vagy az utolsó újraaktiválás, `memberships.resumed_at`) napja későbbi a `dueDay`-nél, az első esedékesség a következő hónapé. Szünet / megszűnés alatt nincs új esedékesség; a leállás napja után esedékes, érintetlen díj törlődik.
- **Pótlás:** `FinanceService.ensureDuesUpTo(now)` (stúdiószinten) és `ensureDuesForGuest(guestId, now?, tx?)` (vendégszinten, hívó tranzakciójában is). Futás: `MembershipDuesScheduler` indításkor és óránként, az elmaradás-lekérdezéskor, a vendég adatlapján és státuszváltás előtt. Csak a legutóbbi meglévő időszak utáni hónapok jönnek létre, a `@@unique([membershipId, period])` + `skipDuplicates` miatt ismételt futás sem duplikál.

### ADR-08: Vendégkommunikáció: kimenő sor, idempotens automatikus levelek, hozzájárulás (TICKET-55)
- **Modul:** `apps/api/src/modules/mailing` (`MailOutboxService`, `EmailTemplatesService`, `EmailAutomationsService`, `EmailCampaignsService`, `EmailConsentService`, `MailingScheduler`). A tiszta szabályok (mezők kitöltése, levélkeret, születés- és névnap, szűrő, hozzájárulás, visszalépés) a `packages/shared/src/email.ts`-ben; az API, a kliensoldali mock (`shared/api/mock-mail.ts`) és az élő előnézet ugyanezt használja.
- **Táblák:** `email_templates` (szanitizált HTML törzs), `email_automations` (üdvözlő / születésnapi / névnapi: be- és kikapcsolás, sablon, `enabled_at`), a `message_logs` kimenő sorrá bővült (`PENDING` / `SENT` / `FAILED`, próbálkozások, következő próba, hibaüzenet, sablon, kategória; a régi sorok megmaradtak, a `DELIVERED` `SENT` lett). Vendég: `marketing_consent`, `marketing_consent_at`, `unsubscribed_at`, `unsubscribe_token` (egyedi).
- **Kimenő sor:** minden levél előbb a sorba kerül; a `MailingScheduler` percenként küld, legfeljebb `MAIL_HOURLY_LIMIT` levelet óránként (alap: 10, SendPulse teszt csomag). Hibánál visszalépő újrapróbálás (5, 10, 20, 40 perc …), 5 próba után végleg hibás; kézzel újraküldhető. SendPulse kulcs nélkül a levelek várakoznak.
- **Dupla küldés kizárása:** az automatikus levél `message_logs.dedupe_key` egyedi kulcsot kap (vendég + automatizmus + év); az ütemező óránként fut a stúdió naptára (`Europe/Budapest`) szerint, 8 órától, és legfeljebb 2 napot pótol, de a bekapcsolás napjánál korábbit nem. Ismételt futás vagy újraindítás után sem megy ki kétszer.
- **Kategória:** az üdvözlő, az egyéni és a tesztlevél tranzakciós; a születés- és névnapi, valamint a csoportos levél marketing: csak hozzájárulással és leiratkozó linkkel (`PUBLIC_WEB_URL/leiratkozas/:token`). A leiratkozás visszavonja a hozzájárulást.
- **Jogosultság:** sablonkezelés, automatikus levelek, csoportos küldés: ADMIN; egyéni levél, napló, újraküldés: minden munkatárs.
- **Env:** `MAIL_HOURLY_LIMIT`, `PUBLIC_WEB_URL` (alapból a `CORS_ORIGIN` első címe).

### ADR-09: Tabletes vendégfelvétel (TICKET-56)
- **Modul:** `apps/api/src/modules/intake` (+ `storage`). Táblák: `intake_packages`, `intake_form_definitions` (verziózott, adatvezérelt kérdőívek; a beépítettek: `packages/shared/src/intake-forms.ts`, indításkor és seedkor feltöltve, meglévő kulcs+verzió nem íródik felül), `intake_sessions`, `intake_health_records` (egészségügyi válaszok külön, csak a `GET /intake/sessions/:id/health` adja ki, minden olvasás és jóváhagyás `AuditLog`), `intake_document_snapshots` (aláíráskori szöveg, verzió, válaszok, aláírás, időbélyeg, SHA-256; adatbázis-trigger tiltja a tartalom módosítását). Bővült: `display_devices.kind` (`MONITOR`/`TABLET`), `photos.purpose` (`PROGRESS`/`PROFILE`), `measurements` (BMI, vázizom %, nyugalmi anyagcsere, has, térd feletti, vádli, `intake_session_id`).
- **Állapotgép:** `packages/shared/src/intake.ts` (`nextIntakeStatus`): előkészítve → vendég kitölti → ellenőrzésre vár → jóváhagyva → aláírva/lezárva; a lezárás (PDF, tárolás) hibája `FAILED`, újrapróbálható. Az API és a kliens mock (`shared/api/mock-intake.ts`) ugyanezt hívja; az átmenetek feltételes `updateMany`-vel védettek a párhuzamos kérések ellen.
- **Vendégmód:** a munkatárs indítja (`guest-mode`: ezen az eszközön, a kliens eldobja a munkatársi tokent) vagy párosított tabletre küldi (`send-to-device` → `intake:assigned` csak az eszköz szobájába → a tablet `POST /intake/device/claim`-mel átveszi). A vendégtoken (fejléc `x-intake-token`, 120 perc, az adatbázisban csak a hash) egy kitöltéshez kötött; az `intake/guest/*` végpontok azonosítót nem fogadnak, így más vendég vagy recepciós adat nem érhető el. Kilépés csak a munkatárs 6 jegyű kilépési kódjával (HMAC, 5 hibás próbálkozás után zárol).
- **Jóváhagyás:** egy `$transaction`-ben az állapot, a vendégprofil (új, meglévő, vagy duplikátumnál a kiválasztott meglévő), a pillanatképek, a mérés, a profilkép és a napló. Utána a PDF-ek: `pdf-lib` + `@pdf-lib/fontkit`, beágyazott Noto Sans (`apps/api/assets/fonts`, OFL), az aláírással, verzióval és időponttal.
- **Tárolás:** `StorageService` a Supabase Storage REST API-jára (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, privát bucket, 10 perces aláírt link). Beállítás nélkül nem production módban helyi fájlrendszer (`LOCAL_STORAGE_DIR`, alapértelmezés `.local-storage/`, HMAC-cel aláírt, lejáró `/api/storage/local/:token` link); productionben `STORAGE.NOT_CONFIGURED`, a kitöltés `FAILED` lesz és beállítás után újrapróbálható.
- **E-mail:** `MailService.send(to, message, { attachments })` (SendPulse `attachments_binary`, base64); a levél a `MessageLog`-ba kerül (`INTAKE_DOCUMENT`).

### ADR-10: Online időpontfoglalás: atomikus kapacitás, egyszeri levonás, várólista, egyirányú naptár (TICKET-57)
- **Modul:** `apps/api/src/modules/bookings` (`BookingsService` recepció, `PublicBookingService` nyilvános foglaló, `WaitlistService`, `BookingNotificationsService`, `CalendarSyncService` + `GoogleCalendarClient`, `BookingsScheduler`). A szabályok tiszta függvényei a `packages/shared/src/booking-rules.ts`-ben (nyitvatartás a szünettel, magyar munkaszüneti napok a húsvétfüggőkkel, 30 nap / 30 perc / 24 óra, kapacitás, többkezeléses sorrend, állapotváltás, bérlet-figyelmeztetés), Europe/Budapest időzónában, nyári időszámítással; az API és a kliensoldali mock (`shared/api/mock-booking.ts`) ugyanezt hívja.
- **Táblák:** `booking_resources` (gép, kapacitás), `bookable_treatments` (időtartam, szünet, sorrend, gép, szolgáltatás; a HIEMT és az Intimpad közös 1 fős gépen), `bookings` (kezelésenként egy sor, `group_id`; `blocked_until` = vége + szünet; `manage_token_hash`, `pass_usage_id`, `deduction_seq`, `reminder_sent_at`, `google_event_id`), `booking_settings`, `booking_closures` (rendkívüli zárvatartás vagy gépletiltás), `booking_holiday_overrides`, `booking_waitlist`, `calendar_sync_outbox`, `guest_login_codes`. Az `audit_logs.user_id` nullázható (vendég online művelete).
- **Atomikus kapacitás:** a foglalás, áthelyezés és várólistás ajánlat egy tranzakcióban `SELECT … FOR UPDATE`-tel zárolja az érintett gépek sorát (azonosító szerinti sorrendben) és a vendég sorát, és csak utána számolja az átfedést (a szünet és az élő várólistás tartás is foglaltság). A párhuzamos második kérés így már látja az elsőt, és `BOOKING.CAPACITY_FULL`-t kap. A kapacitás a recepciónak sem írható felül; a 30 nap / 30 perc / 24 óra igen.
- **Bérlet:** foglaláskor nincs levonás, csak figyelmeztetés. Megérkezéskor vagy a recepciós „Nem jelent meg” rögzítésekor pontosan 1 alkalom a `pass-ledger`-rel, `booking:<id>:<sorszám>` idempotenciakulccsal; visszaállításkor sztornó, a sorszám nő. Lejárt, 0 alkalmas vagy hiányzó bérletnél nincs levonás és nincs tartozás. Automatikus „nem jelent meg” nincs.
- **Vendégoldali azonosítás:** e-mailes 6 jegyű kód (`guest_login_codes`, HMAC-hash, 10 perc, 5 próbálkozás, címenként percenként 1 / óránként 5), utána aláírt, 2 órás munkamenet (`x-guest-session` fejléc, tárolás nélkül). A kezelőlink tokenje a foglalás azonosítójának HMAC-ja a szerver titkával, az adatbázisban csak a SHA-256 hash-e van. Bejelentkezés nélkül a foglalás e-mail szerint a meglévő profilhoz kapcsolódik (új profil csak ismeretlen címre); személyes adat (bérlet, foglalások) csak azonosítás után. A nyilvános végpontokon memóriabeli, címenkénti kéréskorlát van.
- **Háttérfeladatok:** a `BookingsScheduler` percenként: 24 órás emlékeztető (`reminder_sent_at` állapotból, feltételes lefoglalással), lejárt várólistás ajánlatok (a következő várakozó jön), Google outbox (visszalépő újrapróbálás, 6 próba után `FAILED`, a recepción újrapróbálható). Google beállítás nélkül nem kerül tétel a sorba.
- **Valós idő:** `booking:changed` socket esemény a munkatársi szobába, személyes adat nélkül; a recepciós naptár erre újratölt.
- **Beauty alap (TICKET-59):** a „Kozmetikus 1” 1 fős `booking_resources` sor, a kozmetikai kezelések (`bookable_treatments`, szünet nélkül, `is_online = false`, így a nyilvános foglalón nem jelennek meg) a `20261121100000_beauty_basics` migrációban idempotensen (`ON CONFLICT DO NOTHING`) és a seedben. A kezelések a kozmetikai bérlet szolgáltatásához kötöttek (a migráció az „5 Alkalmas Prémium Kozmetikai Bérlet” sablon szolgáltatását, ennek híján a „Hialuronos Arckezelés & Rádiófrekvencia”-t, végül a legrégebbi aktív `COSMETIC` szolgáltatást keresi), így megérkezéskor a gépi szabály szerint 1 alkalom vonódik le. A kapacitás ugyanazon a zárolt úton megy, mint a gépeké.
- **Utolsó kezdés:** a `booking_settings.opening_hours` napjai `{ opensAt, closesAt, lastStartAt }` alakúak (alap: H–P 07:00–19:00, utolsó kezdés 18:00). Minden kezelés (többkezeléses foglalásnál mindegyik tétel) legkésőbb az utolsó kezdéskor indul, és a szünettel együtt a zárásig véget ér, így egy 120 perces kezelés legkésőbb 17:00-kor. A hiányzó vagy hibás `lastStartAt` a zárás (`normalizeOpeningHours`); a migráció a régi 07:00–18:00-s alapnapokat 07:00–19:00 / 18:00-ra állítja, a többi naphoz a zárást írja.
- **Helyben beengedés („Most kezdődik”):** `POST /api/bookings` `walkIn: true`-val. A kezdést a szerver számolja (`walkInStart`: most, 5 percre lefelé kerekítve), az időablakot felülírja, a nyitvatartást és a kapacitást nem. A „Megérkezett” állapotot (és a levonást) a kliens utána a szokásos `PATCH /:id/status`-szal állítja be.

### ADR-11: Napijegy külön bérlettípus, eladáskor tárolt lejárattal (TICKET-7)
- **Típus:** `PassType.DAY_TICKET` (Prisma enum, shared enum, a wire-en szövegként, mint a többi érték). Egy alkalom (`totalPasses = 1`; a sablon `durationDays`-e 1, és nem számít), alkalomszámos típusként kezeljük (`isOccasionPassType`: atomi levonás a `pass-ledger`-ben, elfogyás, visszavonáskor jóváírás). Köredzésre nem ad ingyenes belépést: a beolvasás a kezelésválasztót nyitja (`resolveArrivalEntitlement`, ADR-03), mint az alkalmas bérletnél.
- **Érvényesség:** a vásárlás napján zárásig. A lejáratot a szerver számolja eladáskor (`dayTicketValidUntil`, `packages/shared/src/day-ticket.ts`) a foglalási modul nyitvatartásából (`booking_settings.opening_hours` + az aznapi `booking_holiday_overrides`, `resolveDayHours`), és a bérleten tárolja: `guest_passes.valid_until` (nullable, percre pontos) és `expiration_date` ugyanaz az időpont. A nyitvatartás későbbi módosítása az eladott jegyet nem változtatja. Zárt napon (hétvége, munkaszüneti nap, rendkívüli napi zárás), vagy ha az eladás a zárás után történt, a nap végéig (23:59:59.999, Europe/Budapest) érvényes. Egyedi kezdődátum napijegynél nincs. A részleges / gépenkénti zárvatartás (`booking_closures`) nem számít.
- **Állapot:** a `getPassStatus` a napra pontos `expirationDate` mellett a `validUntil`-t is nézi: ha meg van adva, utána a bérlet `EXPIRED`. A kliens nem számol lejáratot, csak megjeleníti (`formatPassExpiry`).
- **Tiltások:** napijegy nem hosszabbítható és nem fagyasztható (`PASS.DAY_TICKET_FIXED`, 409); a régi, már fagyasztott jegy feloldása megengedett. Levonáskor nincs „utolsó alkalom” / „hamarosan lejár” figyelmeztetés.
- **Migráció:** `20261126150000_day_ticket_type` (enumérték + oszlop; külön, mert az `ADD VALUE`-val bővített értéket ugyanabban a tranzakcióban nem lehet használni) és `20261126150100_day_ticket_backfill` (idempotens): az „1 Alkalmas Napijegy” nevű sablonok és eladott jegyeik napijeggyé válnak. Régi jegyeknél (megrendelői döntés): a lejárt lejárt marad; a még érvényesnél a régi lejárat marad, ha későbbi az eladás napjának zárásánál (`valid_until` üres), különben a zárás lesz a lejárat. A visszamenőleges zárás csak a heti nyitvatartást nézi, a munkaszüneti napokat nem.
- **Mock:** a `mock-engine` ugyanezt a függvényt hívja; a nyitvatartást a `mock-booking` adja (`setStudioHoursSource`), anélkül az alapértelmezés (H–P 07:00–19:00).

### ADR-12: Tartozás miatti elutasítás türelmi idővel, kivételes beengedés (TICKET-15)
- **Egy szabály:** a beléptetés teljes döntése a `resolveCheckInAccess` (`packages/shared/src/entry-rules.ts`): előbb a jogosultság (`resolveArrivalEntitlement`, ADR-03), utána a tartozás (`evaluateEntryDebt`). Ezt hívja az API (`processBarcodeCheckIn`, az offline szinkron is, mert az is a szerveren fut) és a mock. A kliens nem számol, csak megjeleníti.
- **Türelmi idő:** `DEBT_GRACE_DAYS = 5` naptári nap (Europe/Budapest, `getOverdueDays`); a kezdőnap a 0. nap, az 5. napon még beléphet, a 6.-tól elutasítás. Tagdíjnál a kezdőnap az esedékesség (`membership_dues.due_date`, lejárt, nem `PAID`/`WAIVED`, maradékkal). Bérlet-hátraléknál (ADR TICKET-14, `computePassDebt`) **a vásárlás napja** (`guest_passes.created_at`), nem a `debt_since`: így a kiegyenlített, majd sztornó miatt újra keletkezett hátralék is a vásárlástól számít (megrendelői döntés).
- **Fail-closed:** az ismeretlen hátralék (`UNKNOWN`, pl. eladáskori ár nélküli régi bérlet) a türelmi idő után ugyanúgy elutasít (`PASS_DEBT_UNKNOWN`), nem engedjük át csendben. A sztornózott eladás hátraléka `NONE`, nem számít.
- **Mit tilt:** ha a vendég amúgy beléphetne (köredzés vagy kezelésválasztás), az eredmény `DENIED` a tartozás okával (`DUES_OVERDUE` → `PASS_DEBT` → `PASS_DEBT_UNKNOWN`, az első a `deniedReasonCode`, mind a `debtReasons`), `overrideAllowed: true`. Más okú elutasítás (nincs érvényes bérlet, fagyasztás, csak nőknek) marad, azt az override nem oldja fel. A kezelés levonása (`POST /api/pass-usages`) ugyanezt ellenőrzi: tiltásnál `409 CHECKIN.DEBT_BLOCKED`, így a „Kezelés levonása” gomb sem kerüli meg.
- **Kivételes beengedés:** `forceOverride: true` + kötelező `overrideReason` (max. 500 karakter) a beolvasásnál és a levonásnál; recepciós és admin is. Üres indoklás: `400 CHECKIN.OVERRIDE_REASON_REQUIRED`, semmi nem rögzül. A feloldott belépés `logged_check_ins.reason`-je „Kivételes beengedés: …”, és ugyanabban a tranzakcióban `audit_logs` sor: `action = CHECKIN_OVERRIDE`, `entity_type = LoggedCheckIn`, `entity_id` = a belépés, `user_id` és `created_at` (ki, mikor), a `details`-ben a vendég neve és azonosítója, az ok(ok) összeggel és napokkal, és az indoklás. Ha nincs mit feloldani, nincs audit. Kezelésre szóló bérletnél a feloldott beolvasás csak a kezelésválasztót nyitja (`overridden: true`), az audit a levonáskor íródik.
- **Idempotencia:** az override a meglévő mintát követi: a beolvasásnál `idempotencyKey` (a felület dialógusonként egyet küld), a levonásnál `operationKey`; az újrajátszás a korábbi belépést adja vissza, második belépés és audit nélkül. A 10 mp-es dupla leolvasás védelem (ADR-01) is él.
- **Adatvédelem:** a `deniedReasonCode`, `debtReasons`, `overrideAllowed`, `overridden`, `passDebtDays` csak a recepciós payloadban van; a monitorra a `toMonitorPayload` allowlistje miatt nem jut el (TICKET-17).
- **DB:** nincs sémaváltozás (a meglévő `audit_logs` és `guest_passes.created_at` elég).
- **Felület (minimális, a teljes UX a TICKET-18):** a recepciós „Utoljára azonosított vendég” kártyán az elutasítás oka, összeggel és napokkal, és a „Kivételes beengedés” gomb (`pages/reception/ui/desk/CheckInOverrideDialog.tsx`, indoklást kérő dialógus; szövegek: `pages/reception/model/checkInOverrideTexts.ts`). A kivételesen beengedett vendég kezelésének levonásakor a recepció ugyanazt az indoklást küldi.

---

## 3. REST API Végpontok Összefoglalója

Interaktív Swagger/OpenAPI felület elérhető: `GET /api/docs`

| Modul | Metódus & Útvonal | Leírás | Jogosultság |
| :--- | :--- | :--- | :--- |
| **Health** | `GET /api/health` | UptimeRobot ping + 30 percenkénti `SELECT 1` DB keep-alive | Publikus |
| **Auth** | `POST /api/auth/code` | Belépőkód kérése e-mailben (SendPulse; ismeretlen címre is ugyanaz a válasz) | Publikus |
| **Auth** | `POST /api/auth/verify` | Belépés a kóddal (JWT token kiadása) | Publikus |
| **Auth** | `GET /api/auth/me` | Aktuális bejelentkezett felhasználó | JWT |
| **Auth** | `POST /api/auth/monitor/pair-init` | 6 jegyű párosító kód generálása Tablethez | JWT |
| **Auth** | `POST /api/auth/monitor/pair-verify` | Párosító kód beváltása `deviceToken`-re | Publikus |
| **Guests** | `GET /api/guests?q=` | Vendégek listázása és gyorskeresése | JWT |
| **Guests** | `POST /api/guests` | Új vendég regisztrációja (auto vagy egyedi vonalkóddal) | JWT |
| **Guests** | `PATCH /api/guests/:id` | Vendég adatainak / vonalkódjának módosítása | JWT |
| **Passes** | `GET /api/passes/templates` | Bérletsablonok listázása | JWT |
| **Passes** | `POST /api/passes/templates` | Új bérletsablon létrehozása | ADMIN |
| **Passes** | `POST /api/passes/sell` | Bérlet eladása (`GuestPass` + `Payment` atomi tranzakció) | JWT |
| **Passes** | `PATCH /api/passes/:id/extend` | Bérlet meghosszabbítása `+N` nappal + audit napló | ADMIN |
| **Passes** | `PATCH /api/passes/:id/toggle-freeze` | Bérlet fagyasztása / feloldása automatikus lejárat-korrekcióval | ADMIN |
| **Check-Ins** | `POST /api/check-ins/scan` | Atomi vonalkódos beléptetés + WebSocket push |; tartozásnál a türelmi idő után `DENIED`, kivételes beengedés: `forceOverride` + `overrideReason` (ADR-12) | JWT |
| **Check-Ins** | `POST /api/check-ins/:id/revoke` | Téves beléptetés sztornózása (`+1` alkalom visszaírása) | JWT |
| **Check-Ins** | `POST /api/check-ins/sync-offline` | Offline puffer idempotens kötegelt szinkronizálása | JWT |
| **Finance** | `GET /api/finance/daily-summary` | Napi kasszazárás és bevételi bontás fizetési mód szerint | JWT |
| **Finance** | `POST /api/finance/payments/:id/cancel` | Téves bérleteladás és fizetés sztornózása | JWT |
| **Mail** | `GET /api/mail/status` | Levélküldés állapota: beállítva-e, óránkénti korlát, várakozó és hibás levelek | JWT |
| **Mail** | `GET/POST /api/mail/templates`, `PATCH/DELETE /api/mail/templates/:id` | E-mail-sablonok (a lista mindenkié, a módosítás adminé) | JWT / ADMIN |
| **Mail** | `POST /api/mail/test` | Tesztlevél a bejelentkezett munkatárs címére | ADMIN |
| **Mail** | `GET /api/mail/automations`, `PATCH /api/mail/automations/:kind` | Automatikus levelek be- és kikapcsolása, sablon | ADMIN |
| **Mail** | `POST /api/mail/audience/preview`, `POST /api/mail/bulk` | Csoportos küldés: címzettek a szűrő szerint, küldés hozzájárulással | ADMIN |
| **Mail** | `GET /api/mail/messages`, `POST /api/mail/messages/:id/retry` | Elküldött e-mailek (szűrés: címzett, tárgy, típus, sablon, állapot, dátum), újraküldés | JWT |
| **Mail** | `GET/POST /api/mail/guests/:guestId/messages` | A vendég levelei, egyéni levél a vendégnek | JWT |
| **Mail** | `GET/POST /api/public/unsubscribe/:token` | Leiratkozó oldal adatai, leiratkozás (idempotens) | Publikus |
| **Intake** | `GET /api/intake/packages`, `GET /api/intake/forms` | Felvételi csomagok és aktív kérdőív-definíciók | JWT |
| **Intake** | `POST /api/intake/duplicates` | Duplikáció-ellenőrzés (név + születési dátum, telefon, e-mail) | JWT |
| **Intake** | `GET/POST /api/intake/sessions`, `GET/PATCH /api/intake/sessions/:id` | Vendégfelvételek listája, előkészítése, részletei, ellenőrzés (profil, mérések, duplikátumhoz kapcsolás) | JWT |
| **Intake** | `GET /api/intake/sessions/:id/health` | Egészségügyi válaszok (minden olvasás auditnaplóba kerül) | JWT |
| **Intake** | `POST /api/intake/sessions/:id/{guest-mode,send-to-device,release,return,approve,retry,cancel}` | Átadás, visszaküldés, jóváhagyás, lezárás újrapróbálása, megszakítás | JWT |
| **Intake** | `GET /api/guests/:id/intake-documents`, `POST /api/intake/documents/:id/{link,email}` | Aláírt PDF-ek, lejáró link (naplózva), e-mailes küldés | JWT |
| **Intake** | `POST /api/intake/device/claim` | A tabletre küldött kitöltés átvétele | `x-device-token` (tablet) |
| **Intake** | `GET /api/intake/guest/session`, `PUT …/answers`, `PUT …/photo`, `POST …/submit`, `POST …/exit` | Vendégmód: csak a saját kitöltés | `x-intake-token` |
| **Storage** | `GET /api/storage/local/:token` | Helyi tároló lejáró, aláírt letöltési linkje (csak Supabase nélkül) | Aláírt link |
| **Tours** | `GET /api/tours` | A fiók látott oldalbemutatói (`users.tour_state`) | JWT |
| **Tours** | `POST /api/tours` | Bemutató bezárva (`seen`), „Többet ne mutass” (`all`), újraindítás (`reset`) | JWT |
| **Bookings** | `GET /api/bookings/calendar?from=&to=` | Foglalási naptár (napok, gépek, foglalások, zárvatartás, tartások) | JWT |
| **Bookings** | `GET /api/bookings/availability` | Szabad időpontok (többkezeléses, `override` a recepciónak) | JWT |
| **Bookings** | `POST /api/bookings` · `PATCH /:id/reschedule` · `POST /:id/cancel` · `PATCH /:id/status` · `GET /:id/audit` | Foglalás (helyben beengedés: `walkIn`), áthelyezés, lemondás, megérkezett / késik / nem jelent meg, napló | JWT |
| **Bookings** | `GET/PATCH /api/bookings/settings` · `PUT /treatments/order` · `PATCH /treatments/:id` · `PATCH /resources/:id` | Nyitvatartás, korlátok, sorrend, kezelések, gépek | JWT |
| **Bookings** | `POST/DELETE /api/bookings/closures` · `PUT/DELETE /api/bookings/holidays` | Rendkívüli zárvatartás, gépletiltás, ünnepnap-felülírás | JWT |
| **Bookings** | `GET/POST/DELETE /api/bookings/waitlist` · `GET /sync` · `POST /sync/retry` | Várólista, Google Naptár szinkron állapota | JWT |
| **Public booking** | `GET /api/public/booking/catalog` · `GET /availability` · `POST /bookings` | Nyilvános foglaló (belépés nélkül, kéréskorláttal) | Publikus |
| **Public booking** | `POST /api/public/booking/guest/code` · `POST /guest/verify` · `GET /guest/profile` | Vendég e-mailes kóddal, profil (bérletek, foglalások) | Publikus / vendég munkamenet |
| **Public booking** | `GET /api/public/booking/manage/:token` (+ `/availability`, `/reschedule`, `/cancel`) | Kezelőlink: áthelyezés, lemondás 24 órával előtte | Kezelőlink |
| **Public booking** | `POST /api/public/booking/waitlist` · `GET/POST /waitlist/:token(/accept, /decline)` | Várólista, ajánlat elfogadása / elengedése | Publikus / ajánlat link |
