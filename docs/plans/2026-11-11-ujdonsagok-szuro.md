# Terv — 2026-11-11 — Újdonságok: típusszűrő

Állapot: Jóváhagyva (Márk, 2026-11-11)

Kérés (Márk): az Újdonságoknál legyen szűrő (Új funkció / Fejlesztés / Javítás), mert a lista túl sűrű, túl sok minden van rajta.

## Háttér
- Az Újdonságok (`pages/reception/ui/WhatsNewPanel.tsx`) ma mind a 28 bejegyzést egyszerre mutatja, verziónként csoportosítva. Ebből 10 új funkció (köztük 1 „Új oldal”), 9 fejlesztés és 9 javítás.
- A típus (`kind`) minden bejegyzésen megvan (`releaseNotes.ts`), így a szűréshez nem kell adatváltozás, és api vagy mock módosítás sem.

## Jegyek
| Jira | Cím | Típus | Méret | Függ |
| --- | --- | --- | --- | --- |
| TICKET-37 | Újdonságok: szűrés típus szerint | IMPROVEMENT | S | – |

## Worker bontás
- Egy worker: TICKET-37, ág: `TICKET-37` (`origin/demo`-ról). Érintett fájlok:
  - `apps/web/src/pages/reception/ui/WhatsNewPanel.tsx`: szegmens a fejléc alatt (`ToggleGroup type="single"`, UI skill 5.3): **Mind · Új funkció · Fejlesztés · Javítás**, mindegyik mellett a darabszám. Az „Új oldal” típus az „Új funkció” szűrőbe tartozik. Szűréskor az üres verziócsoportok eltűnnek. A találatok száma `aria-live="polite"` régióban jelenik meg.
  - `apps/web/src/pages/reception/model/releaseNotes.ts`: a szűrőcsoportok és a besorolás (tiszta függvény), plusz az Újdonságok bejegyzés.
  - A szűrő a panel saját állapota, alapértelmezés és újranyitáskor „Mind”.
  - A kártyák `details` pontjai alapból összecsukva; „Részletek” / „Kevesebb” link gomb (`aria-expanded`, `aria-controls`) nyitja kártyánként.
- Az olvasottság-jelölés nem változik: megnyitáskor minden bejegyzés olvasottnak számít, a szűrőtől függetlenül.
- Helyi gate és teszt nincs: a worker commitol és jelent, a CI ellenőriz a PR-on.

## Elfogadási feltételek
- A szegmensen egy kattintással csak az adott típus bejegyzései látszanak. A „Mind” visszaállítja a teljes listát.
- A darabszámok egyeznek a látható kártyák számával. Üres verziócím nem marad a listán.
- A részletes pontok alapból rejtve, a „Részletek” gombbal kártyánként nyithatók.
- Billentyűzettel is használható. Világos és sötét témában is a UI skill 5.3 szerinti kinézet.
- CI zöld (gate.sh, E2E).

## Újdonságok bejegyzések
- TICKET-37 → IMPROVEMENT, link nélkül: „Az Újdonságok listája típus szerint szűrhető, a részletek pedig kártyánként nyithatók.”

## Döntések (Márk, 2026-11-11)
1. Alapértelmezett szűrő: „Mind”.
2. A részletes pontok összecsukva, „Részletek” gombbal.
3. Jira: TICKET-37 létrehozva.
