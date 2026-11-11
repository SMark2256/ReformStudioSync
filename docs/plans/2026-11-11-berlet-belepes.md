# Terv — 2026-11-11 — Bérletes belépés, fagyasztás, üdvözlés, női köredzés

Állapot: Folyamatban (1. kör: TICKET-39, TICKET-41)

Bejelentés (Márk): Horváth Dóra (100006) fagyasztott „10 Alkalmas Hypoxi Bérlet”-ét feloldotta, majd beléptette. A rendszer beengedte, de a fennmaradó alkalom 8/10 maradt, a „felhasznált: 2” nem lett 3, és a bérlet-előzményekben sem látszik a belépés. Továbbá: prémium kozmetikai bérletnél a monitor „Jó edzést kívánunk!”-ot ír.

## Megállapítások (kód + éles demo DB)

A `logged_check_ins` táblában a feloldás (18:39:08) után **két** sikeres belépés van (18:39:14 és 18:41:02), mindkettő `visit_type = CIRCUIT_TRAINING`, a Hypoxi bérlethez kötve, levonás nélkül. A fagyasztás jól működött (előtte 8 elutasított próbálkozás „fagyasztva van” okkal), a hiba nem a feloldásban van.

### 1. Gyökérok — a vonalkód / „Köredzés” gomb alkalmas kezelésbérletből ingyenes köredzést ad
- A recepció minden beolvasása `visitType: CIRCUIT_TRAINING`-gel megy (`ReceptionPage.tsx` `handleBarcodeScan`, `GlobalScannerChannel.tsx` `executeScan`, `GuestQuickSearchCard` „Köredzés” gomb).
- A szerver (`check-ins.service.ts`): `isCircuitMode = visitType === CIRCUIT_TRAINING || TIME_BASED` → alkalmas bérletnél **nincs levonás**, nincs `pass_usage_logs` sor, de a belépés a bérletre hivatkozva „sikeres”.
- Nem nézi, hogy a bérlet szolgáltatáshoz kötött-e (`service_id` = Hypoxi), vagyis kezelésbérlet köredzésre is beenged.
- A mock-motor (`mock-engine.ts` `scanCheckIn`) ugyanígy működik.

### 2. Az előzményekből hiányoznak a belépések
- A vendégadatlap „Bérlet-előzmények” és „Kezelések” listája csak a `pass_usage_logs` sorait mutatja. Egy levonás nélküli belépésnek nincs ilyen sora, így sehol nem látszik. A `GuestDto.visits` mező létezik, de az adatlap nem jeleníti meg.

### 3. Fagyasztási furcsaságok
- A jóváírt napok `ceil(eltelt ms / 24 h)`: 4 nap 6 óra fagyasztás → +5 nap. Naptári napot kellene számolni a stúdió időzónájában (`toStudioDayKey`).
- Lejárt, elfogyott vagy sztornózott bérlet is fagyasztható; a szerver nem ellenőrzi, és a „Fagyasztás” gomb minden bérletnél látszik.
- A fagyasztás / feloldás naplósorába (API) nem kerül be, ki rögzítette.

### 4. Az üdvözlő szöveg nem a szolgáltatáshoz igazodik
- A monitor (`MonitorDisplayCard.tsx`) csak a `mode` alapján választ: `CIRCUIT_GREETING` → „Női Köredzés • Érkezés” + „Jó edzést kívánunk!”, minden más → „Kellemes kezelést kívánunk!”. A szolgáltatás kategóriáját (CIRCUIT / COSMETIC / BODY_SHAPING) nem kapja meg.
- Az 1. pont miatt a kozmetikai bérlettel beolvasott vendég is köredzéses üdvözlést kap.
- A dupla beolvasás ága mindig `CIRCUIT_GREETING`-et küld; időalapú bérletnél a szolgáltatásnév mindig „Köredzés”.
- Ugyanez él a recepciós toastban (`notify.ts`) és a `LastCheckInCard.tsx`-ben.

### 5. Női köredzés
- A „Női Köredzés” felirat be van égetve. A rendszer nem ismeri a vendég nemét (`Guest`-ben nincs ilyen mező), és a szolgáltatáson sincs „csak nőknek” jelzés, így a férfi vendég kizárása nem oldható meg.

## Döntések (Márk, 2026-11-11)
- Alkalmas bérletnél a beolvasás **B opció**: nem rögzít belépést, a csippantás után megnyílik a kezelésválasztó ablak.
- A „Női” felirat csak valóban női köredzésnél; férfi vendégnek női köredzés nem adható el, és nem léptethető be vele.
- Jira ticketek létrehozva: TICKET-39 – TICKET-43.

## Jegyek
| Jira | Cím | Típus | Méret | Függ |
| --- | --- | --- | --- | --- |
| TICKET-39 | Beolvasás: alkalmas bérletnél kezelésválasztó ablak, nem ingyenes köredzés | FIX | M | – |
| TICKET-41 | Bérletfagyasztás: naptári napos jóváírás, csak érvényes bérlet fagyasztható | FIX | S | – |
| TICKET-40 | Vendégadatlap: belépések (látogatások) megjelenítése | IMPROVEMENT | S–M | TICKET-39, TICKET-41 |
| TICKET-42 | Vendég neme és a női köredzés korlátozása (eladás, beléptetés) | NEW_FEATURE | M–L | TICKET-39 |
| TICKET-43 | Vendégmonitor és recepció: a szolgáltatáshoz illő üdvözlés | FIX | M | TICKET-39, TICKET-42 |

### TICKET-39 — tartalom
- Közös döntőfüggvény a `packages/shared/src/pass-rules.ts`-ben (pl. `resolveArrivalEntitlement`), az API és a mock is ezt hívja:
  - aktív havi köredzés tagság vagy a köredzésre érvényes időalapú bérlet → köredzés belépés, 0 levonás;
  - csak alkalmas bérlet → új válasz (pl. `TREATMENT_SELECTION_REQUIRED`): **nem** rögzít belépést, **nem** megy a monitorra, a recepción megnyílik a kezelésválasztó ablak (`DeductTreatmentModal`) a vendéggel; ha egyetlen bérlet és szolgáltatás jöhet szóba, előre kiválasztva. A levonás és az üdvözlés a megerősítéskor történik (meglévő `deductTreatmentUsage`);
  - szolgáltatáshoz kötött (Hypoxi, kozmetikai) bérlet köredzésre nem ad jogosultságot;
  - semmi érvényes → elutasítás, mint eddig.
- A globális beolvasás (`GlobalScannerChannel`) is megnyitja az ablakot; a `/monitor` oldalon beolvasva a monitor semleges „Kérjük, fáradj a recepcióhoz!” üzenetet mutat.
- Offline szinkron: a kezelésválasztást igénylő tételek nem rögzülnek, a recepció listát kap róluk.
- A „Köredzés” gomb tooltipje az új működést írja le.
- Tesztek: `check-ins.service.spec.ts` (fagyasztás → feloldás → beolvasás; Hypoxi bérlet; tagság), shared unit teszt, E2E: beolvasás után nyílik az ablak.

### TICKET-41 — tartalom
- Jóváírt napok = naptári napok a fagyasztás és a feloldás napja között (stúdió időzóna, minimum 1).
- Csak `ACTIVE` vagy `NOT_STARTED` bérlet fagyasztható (új hibakód, pl. `PASS.NOT_FREEZABLE`); feloldás mindig mehet. A gomb csak ilyenkor látszik.
- A naplósorba bekerül a rögzítő munkatárs (`employeeId`). Mock ugyanígy.

### TICKET-40 — tartalom
- Belépések listája az adatlapon (dátum, köredzés vagy kezelés, bérlet, rögzítő, állapot: sikeres / sztornózott / elutasított); a Bérletek fülön az adott bérlethez kötött belépések is.
- API: a vendég részletes lekérése adja a belépéseket; mock ugyanígy.

### TICKET-42 — tartalom
- `Guest.gender` (nő / férfi / nincs megadva): migráció, vendég űrlap (új vendégnél kötelező), adatlap, API, mock, seed.
- `Service.womenOnly` jelzés: migráció, szolgáltatás-kezelő, seed (köredzés: igen).
- A havi köredzés tagság a köredzés szolgáltatáshoz kötődik (`Membership.serviceId`, a meglévők a stúdió köredzés szolgáltatására migrálva), így a korlátozás rá is vonatkozik.
- Férfi vendégnek csak nőknek szóló bérlet vagy tagság nem adható el, és vele nem léptethető be: szerveroldali hibakódok (pl. `PASS.WOMEN_ONLY`, `CHECKIN.WOMEN_ONLY`); a felületen ezek a sablonok nem választhatók.
- A vendégfelvétel űrlapján a nem kötelező mező; a keresztnévből a rendszer előre kitölti (közös `inferGenderFromFirstName` a `packages/shared`-ben, gyakori magyar keresztnevek listájával), a recepciós átírhatja.
- Meglévő vendégek: a migráció a keresztnév alapján kitölti a nemet (ugyanazzal a névlistával, kis- és nagybetű-érzéketlenül); amit nem ismer fel, „nincs megadva” marad. A seed és a mock demóvendégei is kapnak nemet.
- „Nincs megadva” nemnél a női köredzés engedélyezett, de a recepció figyelmeztetést kap, hogy pótolja.
- Tesztek: eladás, tagság, beolvasás és kezeléslevonás férfi és női vendéggel.

### TICKET-43 — tartalom
- A `CheckInResultPayload` és a `MonitorCheckInPayload` (a `toMonitorPayload` engedélylistáján) megkapja a szolgáltatás kategóriáját és a `womenOnly` jelzést. Nem érzékeny adat.
- Közös szövegtérkép a `packages/shared`-ben, ezt használja a monitor, a toast és a `LastCheckInCard`:
  - köredzés: „Köredzés • Érkezés” („Női Köredzés • Érkezés”, ha csak nőknek szól) — „Jó edzést kívánunk!”;
  - alakformálás (pl. Hypoxi): „Kezelés • Üdvözlés” — „Kellemes kezelést kívánunk!”;
  - kozmetika: „Kozmetika • Üdvözlés” — „Kellemes kikapcsolódást kívánunk!”;
  - ismeretlen: „Kellemes időtöltést kívánunk!”.
- A dupla beolvasás és az idempotens visszajátszás a korábbi belépés szövegét adja; időalapú bérletnél a valódi szolgáltatásnév jelenik meg.
- Tesztek: `toMonitorPayload` unit, monitor E2E kozmetikai és köredzéses esettel.

## Worker bontás
- 1. kör (párhuzamos):
  - Worker 39 — ág `TICKET-39` (`origin/demo`-ról); érintett: `packages/shared/src/pass-rules.ts`, `socket-events.ts`, `apps/api/src/modules/check-ins/`, `apps/web/src/features/scanner-channel/`, `apps/web/src/features/deduct-treatment/`, `apps/web/src/pages/reception/`, `mock-engine.ts` (`scanCheckIn`, offline szinkron), `e2e/check-in.spec.ts`.
  - Worker 41 — ág `TICKET-41` (`origin/demo`-ról); érintett: `apps/api/src/modules/passes/` (freeze), `mock-engine.ts` (`toggleFreezePass`), `GuestModal.tsx` (gomb), `errors/catalog.ts`.
- 2. kör (a 39 és a 41 `demo`-ra kerülése után, párhuzamosan):
  - Worker 42 — ág `TICKET-42`; érintett: `apps/api/prisma/` (migráció, seed), `apps/api/src/modules/{guests,passes,memberships,check-ins}/`, `packages/shared` (enum, contracts, pass-rules, hibakódok), vendég- és szolgáltatás-űrlapok, `sell-pass`, `mock-engine.ts`.
  - Worker 40 — ág `TICKET-40`; érintett: `apps/api/src/modules/guests/`, `GuestModal.tsx`, `mock-engine.ts`.
- 3. kör: Worker 43 — ág `TICKET-43` (a 42 után); érintett: `packages/shared/src/monitor-payload.ts`, `socket-events.ts`, `apps/api/src/modules/check-ins/`, `passes.service.ts` (`deductTreatmentUsage`), `MonitorDisplayCard.tsx`, `notify.ts`, `LastCheckInCard.tsx`, `mock-engine.ts`, `e2e/monitor.spec.ts`.
- `demo` PR-ok sorrendje: 39, 41, 42, 40, 43.

## Adatjavítás
- Horváth Dóra két ingyenes belépését nem írjuk át automatikusan; a recepció sztornózhatja, és „Kezelés -1”-gyel újra rögzítheti.
- A meglévő vendégek nemét a migráció a keresztnév alapján tölti ki (a demóban 7 vendég: Anna, Dóra, Eszter, Zsófia → nő; Gábor, Péter → férfi; „Élő” → nincs megadva). Az eredményt a Koordinátor az adatbázisban ellenőrzi.

## Elfogadási feltételek
- Horváth Dóra esete: fagyasztás → feloldás → beolvasás után nem jön létre ingyenes belépés, hanem megnyílik a kezelésválasztó ablak; megerősítés után 8 → 7, felhasznált 3, és a belépés látszik az adatlapon.
- Hypoxi vagy kozmetikai bérlettel nem lehet köredzésre belépni; havi tagsággal / köredzés időalapú bérlettel továbbra is 0 levonás.
- Fagyasztás: 4 nap 6 óra → +4 nap; lejárt bérletnél nincs „Fagyasztás” gomb, a szerver elutasítja.
- Férfi vendégnek női köredzés bérlet / tagság nem adható el, és nem léptethető be vele.
- Prémium kozmetikai bérletnél a monitor nem ír „Jó edzést”-et; a „Női” csak a csak nőknek szóló köredzésnél jelenik meg.
- API és mock azonosan viselkedik; CI zöld; a `demo`-n kézi teszt a terv és a UI-ellenőrzőlista (10.4) szerint.

## Újdonságok bejegyzések
- TICKET-39 → FIX, link nélkül: „Alkalmas bérletnél a beolvasás után a kezelésválasztó ablak nyílik meg; nincs ingyenes köredzés.”
- TICKET-41 → FIX, link nélkül: „Fagyasztás feloldásakor naptári napok szerint hosszabbodik a lejárat.”
- TICKET-40 → IMPROVEMENT, link nélkül: „A vendégadatlapon látszanak a belépések.”
- TICKET-42 → NEW_FEATURE, link a vendégadatlapra: „Vendég neme; a női köredzés csak női vendégnek adható.”
- TICKET-43 → FIX, link nélkül: „A vendégmonitor a szolgáltatáshoz illően köszönti a vendéget.”

## Nyitott kérdések a Megrendelőnek
- Nincs. Az 1. kör (TICKET-39, TICKET-41) indítva 2026-11-11-én (Márk: „mehet”). A nem a vendégfelvételbe és az adatbázisba kerül, a meglévők név alapján kitöltve (TICKET-42).
