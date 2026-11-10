# ReformStudioSync — Technikai Architektúra és Tervezési Döntések (ADR)

## 1. Rendszeráttekintés

A **ReformStudioSync** egy egystúdiós (de `studioId` szinten többstúdiós SaaS modellre felkészített) recepciós, pénzügyi és valós idejű vendégmonitor webalkalmazás, amelynek célja a **0 Ft / hó** fix felhő-infrastruktúra költség (Supabase Free Tier + Render Hobby Tier + Vercel Free Tier + UptimeRobot).

### 1.1. Monorepo Felépítés

- **`packages/shared` (`@reform/shared`):** Közös TypeScript szerződések, Enumok (`Role`, `PassType`, `PaymentMethod`, `CheckInStatus`), REST DTO interfészek és Socket.io esemény-definíciók (`SOCKET_EVENTS`, `CheckInResultPayload`, `CheckInRevokedPayload`).
- **`apps/api` (`@reform/api`):** NestJS 10 REST API + Socket.io WebSocket Gateway (`/monitor` névtér) + Prisma ORM + Swagger/OpenAPI (`/api/docs`).
- **`apps/web` (`@reform/web`):** React 18 + Vite + Tailwind CSS + TanStack Query v5 + Zustand + Sonner Toast értesítési réteg + Kliensoldali Mock Sandbox motor (`shared/api/mock-engine.ts`). A frontend a [Feature-Sliced Design](https://feature-sliced.design) módszertan szerint épül fel (lásd 1.2).
- **`e2e/` + `playwright.config.ts`:** Playwright böngészős tesztek mock-módban: a web nem elérhető API-címmel buildelve (`.e2e-dist/`, `vite preview`) a mock motorra esik vissza, így API és adatbázis nélkül futnak (`npm run test:e2e`, részletek: `e2e/README.md`). A gate-nek nem része.

### 1.2. Frontend Rétegek (Feature-Sliced Design)

Az `apps/web/src` könyvtár rétegei felülről lefelé. Egy réteg csak az alatta lévő rétegekből importálhat, és minden slice-t csak a saját `index.ts` publikus API-ján keresztül lehet elérni (`@/features/sell-pass`, nem `@/features/sell-pass/ui/...`).

| Réteg | Slice-ok | Tartalom |
| :--- | :--- | :--- |
| `app/` | — | Belépési pont (`index.tsx`), QueryClient + Toaster providerek, router (`App.tsx`), globális stílusok |
| `pages/` | `login`, `reception`, `monitor`, `tablet-document`, `demo-sandbox` | Útvonalanként egy oldal |
| `widgets/` | `guest-profile`, `version-changelog` | Önálló, összetett UI blokkok |
| `features/` | `scanner-channel`, `sell-pass`, `deduct-treatment`, `record-payment`, `toggle-theme` | Felhasználói műveletek |
| `entities/` | `guest`, `check-in` | Üzleti entitások UI-ja és állapota (offline puffer, szkenner csatorna store) |
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

### ADR-03: Determinisztikus Bérlet-Priorizálás
- **Szabályok:**
  1. Csak az `isActive === true`, `isFrozen === false`, `startDate <= now` és `expirationDate >= now` bérletek vehetők figyelembe.
  2. Ha a vendégnek van aktív `TIME_BASED` (időkorlátos korlátlan) bérlete, a rendszer azt részesíti előnyben, hogy az alkalmas bérlete ne fogyjon.
  3. Több `OCCASION_BASED` bérlet esetén a **leghamarabb lejáró** (`expirationDate ASC`) bérletből történik a levonás.

### ADR-04: Dual-Mode Vendégmonitor (`BroadcastChannel` + `Socket.io` + `DisplayDevice`)
- **Másodlagos Monitor (Azonos PC):** A böngésző natív `BroadcastChannel('reform_monitor_channel')` csatornáján `< 1 ms` késleltetéssel kapja meg a beléptetési és sztornó eseményeket.
- **Önálló Eszköz (Tablet / iPad / Smart TV):** A recepción generált 6 jegyű párosító kóddal (`POST /api/auth/monitor/pair-init` -> `POST /api/auth/monitor/pair-verify`) az eszköz egy dedikált `deviceToken`-t kap, amellyel autentikálódik a `/monitor` Socket.io névtéren.

### ADR-05: Állandó Recepciós Toast Visszajelző Rendszer Fókusz-Elrablás Nélkül
- A `QueryClient` `MutationCache` globális `onError` ága minden API- vagy hálózati hibát automatikusan piros Toast üzenetként (`sonner`) jelenít meg.
- Minden recepciós művelet (beléptetés, elutasítás, dupla leolvasás, bérleteladás, sztornó, vendég-mentés, bérletfagyasztás, hosszabbítás, digitális kártya letöltés) dedikált vizuális Toast visszaigazolást és szintetizált Web Audio API hangjelzést ad, miközben a `useBarcodeScanner` billentyűzet-figyelése zavartalan marad.

---

## 3. REST API Végpontok Összefoglalója

Interaktív Swagger/OpenAPI felület elérhető: `GET /api/docs`

| Modul | Metódus & Útvonal | Leírás | Jogosultság |
| :--- | :--- | :--- | :--- |
| **Health** | `GET /api/health` | UptimeRobot ping + 30 percenkénti `SELECT 1` DB keep-alive | Publikus |
| **Auth** | `POST /api/auth/login` | Bejelentkezés (JWT token kiadása) | Publikus |
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
