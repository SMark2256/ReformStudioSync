# ReformStudioSync — Folyamatos Fejlesztési Napló (Development Log)

Ez a dokumentum rögzíti a **ReformStudioSync** rendszer fázisonkénti megvalósítását, a meghozott műszaki döntéseket és az ellenőrzési eredményeket.

---

## Fázis 1: Monorepo Alapstruktúra és `@reform/shared` Csomag
- **Megvalósított elemek:**
  - Gyökér `package.json`, `pnpm-workspace.yaml` és `tsconfig.base.json` konfigurálása.
  - `packages/shared` csomag felépítése:
    - `enums.ts`: `Role`, `PassType`, `PaymentMethod`, `CheckInStatus`, `CheckInWarningCode` és rendszerkonstansok (`DUPLICATE_SCAN_COOLDOWN_SECONDS = 60`, `EXPIRING_SOON_THRESHOLD_DAYS = 3`).
    - `socket-events.ts`: `SOCKET_NAMESPACE = '/monitor'`, `SOCKET_EVENTS` és a `CheckInResultPayload`, `CheckInRevokedPayload`, `MonitorStatePayload` interfészek.
    - `contracts/index.ts`: Teljes körű DTO-k a vendégekhez, bérletekhez, pénzügyhöz, offline szinkronhoz és kijelző-párosításhoz.

## Fázis 2: Adatbázis Réteg (Prisma) és NestJS Alapstruktúra (`apps/api`)
- **Megvalósított elemek:**
  - `apps/api/prisma/schema.prisma` véglegesítése összetett indexekkel, SaaS-ready `studioId` mezőkkel, pénzügyi audit mezőkkel (`recordedByUserId`, `isCancelled`), bérletfagyasztás mezőkkel (`isFrozen`, `frozenAt`), idempotencia kulccsal (`idempotencyKey`) és a `DisplayDevice` táblával.
  - `apps/api/prisma/seed.ts` elkészítése alapértelmezett Admin (`admin@reformstudio.hu`), Recepciós (`recepcio@reformstudio.hu`) fiókokkal és 4 Reformer Pilates bérletsablonnal.
  - `HealthController` (`GET /api/health`) implementálása 30 percenkénti throttled `SELECT 1` adatbázis pinggel a Render és a Supabase Free Tier egyidejű ébrentartásához.
  - `@nestjs/swagger` integrálása a `/api/docs` végponton.

## Fázis 3: Autentikáció, Vendég-, Bérlet- és Pénzügyi Modulok (`apps/api`)
- **Megvalósított elemek:**
  - `AuthModule`: JWT autentikáció, `RolesGuard` (`ADMIN`, `RECEPTIONIST`) és 6 jegyű Tablet/TV kijelző-párosító rendszer (`initDisplayPairing`, `verifyDisplayPairing`, `validateSocketToken`).
  - `GuestsModule`: Vendég CRUD automatikus (`RSxxxxxx`) vagy egyedi vonalkód-kiosztással, ütközésvizsgálattal és gyorskereséssel.
  - `PassesModule`: Bérletsablonok kezelése, atomi bérletértékesítés (`sellPass`), Admin bérlethosszabbítás (`extendPass` `+N` nappal) és bérletfagyasztás/feloldás (`toggleFreezePass` automatikus fagyasztott nap jóváírással).
  - `FinanceModule`: Napi kasszaösszesítő (`getDailySummary`) fizetési módok szerinti (`CASH`, `POS_CARD`, `BANK_TRANSFER`) bontásban és téves fizetés sztornózása (`cancelPayment`).

## Fázis 4: Valós Idejű Monitor Gateway és Atomi Beléptetés (`apps/api`)
- **Megvalósított elemek:**
  - `MonitorGateway` (`Socket.io`): `/monitor` névtér, `studio:default-studio` szobakezelés, csatlakoztatott kijelzők számlálása, `checkin:result` és `checkin:revoked` események küldése.
  - `CheckInsService`:
    - Idempotencia ellenőrzés (`idempotencyKey`).
    - 60 másodperces dupla lehúzás védelem (`DUPLICATE_SCAN`) felülbírálási lehetőséggel (`forceDuplicate`).
    - Fagyasztott bérlet detektálás (`isFrozen`).
    - Determinisztikus bérlet-priorizálás (`TIME_BASED` -> leghamarabb lejáró `OCCASION_BASED`).
    - Atomi `updateMany` (`remainingPasses > 0`) levonás a versenyhelyzetek kizárására.
    - `LAST_OCCASION` és `EXPIRING_SOON` figyelmeztetések + `suggestedRenewalTemplateId` visszaadása.
    - Post-commit WebSocket broadcast.
    - 1 kattintásos beléptetés sztornó (`revokeCheckIn`) és kötegelt offline várólista szinkron (`syncOfflineScans`).

## Fázis 5: Frontend Architektúra, Toast Rendszer, Prémium Funkciók és `/demo` Sandbox (`apps/web`)
- **Megvalósított elemek:**
  - Központi **Toast Notification rendszer (`src/lib/notify.ts` + `Sonner` + `MutationCache`)** és szintetizált **Web Audio API hangjelző (`src/lib/sound.ts`)** fókusz-elrablás nélkül.
  - Globális `useBarcodeScanner` hook (`< 45 ms` karakterenkénti detektálás).
  - Dual-Mode `useMonitorChannel` hook (`Socket.io` + `BroadcastChannel` + `Screen Wake Lock API`).
  - **Digitális Belépőkártya Generátor (`DigitalPassCardModal.tsx`):** Code-128 vonalkód (`jsbarcode`) + QR-kód (`qrcode`) + nagy felbontású PNG kártya letöltés.
  - **Offline Olvasási Puffer (`offlineQueueStore.ts`):** perzisztens várólista és automatikus FIFO visszatöltés.
  - **Recepciós Munkafelület (`/reception`), Vendégmonitor (`/monitor`) és Interaktív Demo Sandbox (`/demo`)** teljes körű megvalósítása.

## Fázis 6: Deployment Konfigurációk és Dokumentációk
- **Megvalósított elemek:**
  - `render.yaml` Blueprint, `apps/web/vercel.json`, `.env.example` sablonok.
  - `docs/INSTALLATION_GUIDE.md` (Telepítési és Üzemeltetési Útmutató) és `docs/USER_GUIDE.md` (Felhasználói Kézikönyv).

## Fázis 7: Kritikus Üzleti Tesztkészlet (`Vitest`) és Recepciós Sötét Mód (Dark Mode)
- **Megvalósított elemek:**
  - **Kritikus végkimenetel tesztek (`npm test`):**
    - `apps/api/src/modules/check-ins/check-ins.service.spec.ts` (8 üzleti teszteset: sikeres levonás, `TIME_BASED` vs `OCCASION_BASED` priorizálás, leghamarabb lejáró bérlet kiválasztása, `LAST_OCCASION` + `EXPIRING_SOON` figyelmeztetések és inaktiválás, 60 mp-es `DUPLICATE_SCAN` védelem és `forceDuplicate` felülbírálás, `DENIED` elutasítások fagyasztott/lejárt/ismeretlen kártyára, `ConflictException` versenyhelyzet-védelem negatív egyenleg ellen, 1-kattintásos `revokeCheckIn` sztornó és offline `idempotencyKey`).
    - `apps/api/src/modules/passes/passes-finance.spec.ts` (3 pénzügyi és bérlet teszteset: atomi bérleteladás + kasszatétel, fagyasztás feloldásakor automatikus nap-jóváírás a lejáratra, valamint fizetés sztornózásakor bérlet-deaktiválás és napi kasszazárás korrekció).
  - **Választható Recepciós Sötét Mód (`useThemeStore` + `ThemeToggleButton`):**
    - `apps/web/src/stores/themeStore.ts` és `apps/web/src/components/ThemeToggleButton.tsx` (1-kattintásos Nap/Hold kapcsoló a Recepciós Pult és a Demo fejlécében, `localStorage` mentéssel).
    - A Vendégmonitor (`/monitor` és `MonitorDisplayCard` `.monitor-invariant` védelemmel) megjelenése garantáltan változatlan marad.
