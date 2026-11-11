# Terv — 2026-11-11 — Születésnapi konfetti a Vendégmonitoron

Állapot: Jóváhagyva (Márk, 2026-11-11)

Kérés (Márk): ha egy vendég a születésnapján lép be, a Vendégmonitoron 2 másodpercig konfetti-animáció fusson, a https://motion.dev/examples/react-confetti mintájára.

## Háttér
- A minta a **Motion+** (fizetős) csomag része, a forráskódja nem nyilvános. Az ingyenes `motion` csomaggal (`motion/react`) ugyanilyen hatás elkészíthető: gombnyomás helyett a belépéskor egy középről induló konfettirobbanás, véletlenszerű irány, sebesség, forgás és szín, gravitációval lefelé hulló, elhalványuló részecskék.
- A monitorra csak a `toMonitorPayload` által engedett mezők kerülnek (`packages/shared/src/monitor-payload.ts`). A születésnapot ezért egyetlen `isBirthday` logikai mező jelzi, születési dátum nem kerül át.
- A születésnap ma csak a Recepció „Mai ünnepeltek” listájában jelenik meg (`finance.service.ts`). A beléptetési eredmény nem tartalmazza.

## Jegyek
| Jira | Cím | Típus | Méret | Függ |
| --- | --- | --- | --- | --- |
| TICKET-36 | Vendégmonitor: születésnapi konfetti belépéskor | NEW_FEATURE | S | – |

## Worker bontás
- Egy worker: TICKET-36, ág: `TICKET-36` (`origin/demo`-ról). Érintett fájlok:
  - `packages/shared`: `CheckInResultPayload.isBirthday?` és `MonitorCheckInPayload.isBirthday?`. A `toMonitorPayload` csak sikeres belépésnél (`SUCCESS`) adja tovább, a contract-teszt kiegészítésével.
  - `apps/api`: a `check-ins.service.ts` és a `passes.service.ts` sikeres üdvözlésnél kitölti az `isBirthday`-t. A napot Europe/Budapest szerint számolja, a hónap és a nap egyezését nézi, és február 29-i születésnapnál nem-szökőévben február 28-at vesz.
  - `apps/web/src/shared/api/mock-engine.ts`: ugyanez a mock párban. Kovács Anna már most mai születésnapos, így a demón azonnal kipróbálható.
  - `apps/web/src/shared/ui` (vagy `entities/check-in/ui`): `BirthdayConfetti` komponens a `motion` csomaggal. A `MonitorDisplayCard` sikeres, `isBirthday` üdvözlésnél egyszer lejátssza, 2 másodperc után eltávolítja, és a név alatt „Boldog születésnapot!” feliratot mutat. Kattintást nem fog meg, `prefers-reduced-motion` esetén nem fut (a felirat ekkor is megjelenik).
  - `apps/web/package.json`: új függőség, a `motion`.
  - Újdonságok bejegyzés: `releaseNotes.ts`.
- Helyi gate és teszt nincs: a worker commitol és jelent, a CI ellenőriz a PR-on.

## Elfogadási feltételek
- Sikeres belépéskor (köredzés és kezelés-üdvözlés is), ha a vendégnek ma van a születésnapja, a monitoron kb. 2 másodpercig konfetti hullik, utána nyomtalanul eltűnik. Az üdvözlésben „Boldog születésnapot!” felirat látszik. Az üdvözlés a szokásos ideig látszik.
- Nem születésnapos vendégnél, elutasításnál és ismételt (`DUPLICATE`) beolvasásnál nincs konfetti.
- A monitor payloadjában csak `isBirthday: true` jelenik meg, dátum nem.
- Működik a demón (mock), a böngészős monitorablakban és a párosított külső kijelzőn is.
- Akadás nélkül fut a kijelzőn. A konfetti csak `transform` és `opacity` animációt használ.
- CI zöld (shared contract-teszt, api unit teszt az `isBirthday`-re).

## Újdonságok bejegyzések
- TICKET-36 → NEW_FEATURE, link nélkül (csak születésnapon látható, nem nyitható meg külön): „Születésnapos vendégeinket konfetti köszönti a Vendégmonitoron.”

## Döntések (Márk, 2026-11-11)
1. Könyvtár: az ingyenes `motion` csomag.
2. Felirat: kell a „Boldog születésnapot!” felirat is.
3. Jira: TICKET-36 létrehozva.
