# Terv — 2026-11-14 — Nyitott ticketek átnézése és lefejlesztése

Állapot: Folyamatban — az 1. kör (TICKET-3, TICKET-4, TICKET-5, TICKET-8, TICKET-52) commitolva a saját ágán, `demo` PR-ra vár („mehet”). Próba-merge: a kód ütközésmentes, csak az Újdonságok tömb eleje ütközik.

### 1. kör eredménye

| Jira | Ág / commit | Megjegyzés |
| --- | --- | --- |
| TICKET-5 | `TICKET-5` / a1d3d66 | Felismerés tiszta függvényben (`scanSequence.ts`), unit + hook tesztek; `data-barcode-ignore` a név/e-mail/megjegyzés mezőkön. |
| TICKET-4 | `TICKET-4` / 20a2e1e | Közös `GuestPicker` (entities/guest) a három modálban; E2E fixme → test. |
| TICKET-52 | `TICKET-52` / aea52b9 | `GuestPhotos.tsx`, nagyító max. 1100 px széles (a 640 px-es modálnál szélesebb). |
| TICKET-8 | `TICKET-8` / a174baa | `canDeleteMeasurement` (shared), DELETE végpont, audit `MEASUREMENT_DELETED`, API- és mock-tesztek. |
| TICKET-3 | `TICKET-3` / 041cc94 | mock-engine `subscribe`/`getVersion`, storage esemény; vendégválasztó a szimulátorban. |

Javasolt új ticketek (a workerek találták): a `POST guests/:id/measurements` nem ellenőrzi a stúdiót; a levonás és a befizetés modál gyorsgombról a lista első vendégét választja ki.

Márk kérése: a nyitott ticketekből ami már nem kell, az Kész; ami kell, azt lefejlesztjük, a `demo` ágról indulva.

## Átnézés (a `demo` 2245c99 állapotán)

| Jira | Cím | Döntés | Indok |
| --- | --- | --- | --- |
| TICKET-1 | Bejelentkezés után nem vonódnak le az alkalmak | **Kész, nem kell** | A TICKET-39 megoldotta: alkalmas bérletnél kezelésválasztó, megerősítéskor 1 levonás, API és mock azonosan. |
| TICKET-6 | Bérlet-levonás és kezelések egyben | **Kész, nem kell** | A TICKET-16 megoldotta: a Kezelések fülön csak delta < 0, a vásárlás külön, gomb nélkül. |
| TICKET-3 | Új vendég nem látszik a demó szimulátorban | Kell (S) | A szimulátor gombjai fix vonalkódokra szólnak; más fül változását a sandbox nem figyeli. |
| TICKET-4 | Eladási ablakban nincs vendégválasztó | Kell (M) | Az „Új bérlet” gyorsgomb a `lastIdentifiedGuest ?? guests[0]` vendéggel nyit, a `SellPassModal`-ban nincs választó. |
| TICKET-5 | QR / vonalkód csatorna elnyeli a gépelést | Kell (M) | A `useBarcodeScanner` változatlan; a TICKET-50 csak alapból kikapcsolta a csatornát. |
| TICKET-8 | Mérés nem törölhető | Kell (M) | Nincs DELETE végpont, kliens, mock és gomb. |
| TICKET-52 | Vendégfotó nagyító nézet | Kell (S) | A fotó csak 176 px-es `object-cover` bélyegkép. |
| TICKET-14 | Bérlet-hátralék (részletfizetés) | Kell (M) | Nincs hátralék-számítás a bérletre. |
| TICKET-15 | Egységes beléptetési szabály | Részben kész, a maradék kell (M–L) | Kész: közös döntőfüggvény, lejárat napvégéig, kezelési bérlet nem ad köredzést, offline azonos mód. Hiányzik: tartozás miatti elutasítás 5 nap türelmi idő után (tagdíj és bérlet-hátralék), kivételes beengedés API indoklással és naplóval. |
| TICKET-18 | Recepció: elutasítás oka, kivételes beengedés | Részben kész, a maradék kell (M) | Kész: szolgáltatás szerinti bérletszűrés a levonásnál, bérletállapot-címkék, tartozás összege a kártyán. Hiányzik: kivételes beengedés gomb és jelölés, elutasítási gyorsgombok, „Lejárt” jelölés mindenhol ellenőrizve. |
| TICKET-7 | Napijegy külön típus | Kell (L) | Nincs napijegy típus; Prisma migráció kell. Nyitott kérdés, lásd lent. |

## Worker bontás

- **1. kör (párhuzamos, `origin/demo`-ról, egymástól független):**
  - Worker 5 — ág `TICKET-5`; `apps/web/src/shared/lib/barcode-scanner/`, a szövegmezők `data-barcode-ignore` jelölése.
  - Worker 4 — ág `TICKET-4`; `features/sell-pass`, `pages/reception/ui/desk/ReceptionDeskTab.tsx`, `ReceptionPage.tsx`, `DemoSandboxPage.tsx` (hívó).
  - Worker 8 — ág `TICKET-8`; `apps/api/src/modules/guests/`, `shared/api/client.ts`, `mock-engine.ts`, `GuestModal.tsx` (Mérések fül).
  - Worker 52 — ág `TICKET-52`; `GuestModal.tsx` (Fényképek fül), esetleg új `shared/ui` lightbox.
  - Worker 3 — ág `TICKET-3`; `pages/demo-sandbox/`, `mock-engine.ts` (változásértesítés).
- **2. kör (az 1. kör `demo`-ra kerülése után):** TICKET-14, utána TICKET-15 maradéka (épít a 14 hátralékára).
- **3. kör:** TICKET-18 maradéka (a 15 override API-jára épít); TICKET-7 Márk válasza után.
- Átfedés: a `GuestModal.tsx`-et a 8 és az 52 is érinti (más fülön), a `mock-engine.ts`-t a 8 és a 3; az Újdonságok tömb elejét mindenki. A `demo` PR-ok sorrendje: 5, 4, 52, 8, 3; az ütközést a Koordinátor oldja fel.
- A workerek nem futtatnak helyben gate-et vagy tesztet (a CI ellenőriz), PR-t nem nyitnak, a Jirába nem írnak.

## Elfogadási feltételek

A ticketek saját elfogadási feltételei, plusz: világos és sötét téma, magyar szöveg, FSD-szabályok, mock pár minden új végponthoz, Újdonságok bejegyzés, CI zöld, kézi teszt a `demo`-n a terv és a UI-ellenőrzőlista (10.4) szerint.

## Újdonságok bejegyzések

- TICKET-5 → FIX: „Gyors gépelésnél sem vesznek el karakterek, a vonalkódolvasó bármely mezőből működik.”
- TICKET-4 → FIX: „Új bérlet eladásakor kereshető vendégválasztó.”
- TICKET-8 → IMPROVEMENT: „A hibásan rögzített mérés törölhető.”
- TICKET-52 → IMPROVEMENT: „A vendégfotók nagyban is megnézhetők, lapozhatók.”
- TICKET-3 → FIX: „A demó szimulátorban az új vendég azonnal beléptethető.”

## Nyitott kérdések a Megrendelőnek

1. **TICKET-7 (napijegy):** a napijegy a vásárlás napján **éjfélig** vagy **zárásig** érvényes? A meglévő „1 Alkalmas Napijegy” sablonokat és eladott jegyeket a migráció alakítsa át napijeggyé?
2. **TICKET-15 / TICKET-18:** a tartozás miatti tiltás (5 nap türelmi idő után) a tagdíjra és a bérlet-hátralékra is kell még? A kivételes beengedést a recepciós is használhatja, vagy csak admin?
