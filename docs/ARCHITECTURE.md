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
| `pages/` | `login`, `reception`, `monitor`, `monitors`, `settings`, `tablet-document`, `demo-sandbox` | Útvonalanként egy oldal |
| `widgets/` | `guest-profile`, `version-changelog` | Önálló, összetett UI blokkok |
| `features/` | `scanner-channel`, `sell-pass`, `deduct-treatment`, `record-payment`, `toggle-theme` | Felhasználói műveletek |
| `entities/` | `guest`, `check-in`, `display-device` | Üzleti entitások UI-ja és állapota (offline puffer, szkenner csatorna store, kijelzőlista lekérdezése) |
| `shared/` | `api`, `auth`, `theme`, `lib/*` | REST kliens + mock motor, session store, téma store, notify/sound/szkenner/monitor csatorna segédek |

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

### ADR-04: Dual-Mode Vendégmonitor (`BroadcastChannel` + `Socket.io` + `DisplayDevice`)
- **Másodlagos Monitor (Azonos PC):** A böngésző natív `BroadcastChannel('reform_monitor_channel')` csatornáján `< 1 ms` késleltetéssel kapja meg a beléptetési és sztornó eseményeket.
- **Önálló Eszköz (Tablet / iPad / Smart TV):** A recepción generált 6 jegyű párosító kóddal (`POST /api/auth/monitor/pair-init` -> `POST /api/auth/monitor/pair-verify`) az eszköz egy dedikált `deviceToken`-t kap, amellyel autentikálódik a `/monitor` Socket.io névtéren.
- **Adatszűrés (TICKET-17):** A monitorra csak a `toMonitorPayload` (`@reform/shared`) által szűkített `MonitorCheckInPayload` / `MonitorCheckInRevokedPayload` kerül: tartozás, vonalkód, azonosító és elutasítási ok nélkül, elutasításnál név nélkül. A gateway két szobát használ: `studio:<id>` (minden kliens; a `monitor:checkin-result` / `monitor:checkin-revoked` szűkítve, a staff szoba kivételével) és `studio:<id>:staff` (csak munkatársi token, teljes `checkin:result` / `checkin:revoked`). A munkatársi tokennel megnyitott `/monitor` `displayOnly` jelzővel csatlakozik, így a staff szobába nem kerül be, és a recepciós scanner-csatornára sem iratkozik fel. A helyi `broadcastToLocalMonitors` ugyanezzel a függvénnyel szűr.
- **Visszavonás és elutasítás (TICKET-31):** Törlés vagy új párosító kód után a `MonitorGateway.disconnectDevice` az eszköz minden socketjének közvetlenül elküldi a `monitor:device-revoked` eseményt, bontja őket, és a nyilvántartásból azonnal törli (a recepció csak az új `monitor:state` kijelzőszámot kapja). A visszavonás alatt hitelesülő, régi tokenes kapcsolat nem regisztrálhat (visszavonási sorszám). Elutasított vagy hiányzó tokennél a szerver a bontás előtt `monitor:auth-rejected` eseményt küld (`MonitorAuthRejectedPayload`: katalóguskód és -üzenet).
- **Kliensoldali kapcsolatállapot (TICKET-32):** A `useMonitorChannel` `connectionStatus`-a (`idle` / `connecting` / `live` / `offline`) csak a szerver `monitor:state` üzenete után `live` (a socket `connect` eseménye még nem jelenti, hogy a gateway beléptette a szobába); bontásnál, `connect_error`-nál és elutasításnál `offline`, és a kijelzőszám 0-ra áll. `monitor:auth-rejected` után `COMMON.INTERNAL` kódnál a hook 5 mp múlva kézzel újracsatlakozik (legfeljebb 5-ször, élő kapcsolat után újra), más kódnál nem. Eszköztokennel futó monitoron az `AUTH.DEVICE_TOKEN_INVALID` és a saját `monitor:device-revoked` törli a párosítást (kódbekérő képernyő); munkatársi munkamenetnél a párosítás marad.

### ADR-05: Állandó Recepciós Toast Visszajelző Rendszer Fókusz-Elrablás Nélkül
- A `QueryClient` `MutationCache` globális `onError` ága minden API- vagy hálózati hibát automatikusan piros Toast üzenetként (`sonner`) jelenít meg.
- Minden recepciós művelet (beléptetés, elutasítás, dupla leolvasás, bérleteladás, sztornó, vendég-mentés, bérletfagyasztás, hosszabbítás, digitális kártya letöltés) dedikált vizuális Toast visszaigazolást és szintetizált Web Audio API hangjelzést ad, miközben a `useBarcodeScanner` billentyűzet-figyelése zavartalan marad.

### ADR-06: Mock fallback csak demó módban (TICKET-17)
- A `shared/api/client.ts` `request()` hálózati hibánál csak demó módban (`isDemoMode()`: `VITE_DEMO_MODE=true` build, vagy a `/demo` útvonal) vált a `mock-engine.ts`-re. Élesben `COMMON.NETWORK` hiba és toast jön, így beléptetés, levonás vagy fizetés nem dőlhet el kitalált adaton. Az E2E build `VITE_DEMO_MODE=true`-val fut.

### ADR-07: Havi Tagdíj-Esedékességek Idempotens Pótlása (TICKET-13)
- **Közös szabály:** `packages/shared/src/membership-dues.ts` tiszta függvényei (`getMembershipDueSchedule`, `getMissingDues`, `getOverdueDays`, `getOverdueBucket`) számolnak a stúdió naptára (`Europe/Budapest`) szerint; az API és a kliensoldali mock motor ugyanezt használja.
- **Ütemezés:** a folyó hónapig minden hónapnak van esedékessége (hónap elejétől befizethető). Ha a kezdés (vagy az utolsó újraaktiválás, `memberships.resumed_at`) napja későbbi a `dueDay`-nél, az első esedékesség a következő hónapé. Szünet / megszűnés alatt nincs új esedékesség; a leállás napja után esedékes, érintetlen díj törlődik.
- **Pótlás:** `FinanceService.ensureDuesUpTo(now)` (stúdiószinten) és `ensureDuesForGuest(guestId, now?, tx?)` (vendégszinten, hívó tranzakciójában is). Futás: `MembershipDuesScheduler` indításkor és óránként, az elmaradás-lekérdezéskor, a vendég adatlapján és státuszváltás előtt. Csak a legutóbbi meglévő időszak utáni hónapok jönnek létre, a `@@unique([membershipId, period])` + `skipDuplicates` miatt ismételt futás sem duplikál.

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
| **Check-Ins** | `POST /api/check-ins/scan` | Atomi vonalkódos beléptetés + WebSocket push | JWT |
| **Check-Ins** | `POST /api/check-ins/:id/revoke` | Téves beléptetés sztornózása (`+1` alkalom visszaírása) | JWT |
| **Check-Ins** | `POST /api/check-ins/sync-offline` | Offline puffer idempotens kötegelt szinkronizálása | JWT |
| **Finance** | `GET /api/finance/daily-summary` | Napi kasszazárás és bevételi bontás fizetési mód szerint | JWT |
| **Finance** | `POST /api/finance/payments/:id/cancel` | Téves bérleteladás és fizetés sztornózása | JWT |
