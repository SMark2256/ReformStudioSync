# Terv — 2026-11-11 — Levegősebb, átláthatóbb felület

Állapot: Jóváhagyva (2026-11-12), folyamatban

Kérés (Márk): „szeretném egy kicsit szellősebbre, jobban átláthatóbbá tenni az egész UI-t”.

## Helyzetkép (demo, 1440 px és 390 px, mock adatokkal)

- **Minden oldal tetején ugyanaz a státuszsor** (QR Csatorna, Online, hang, Tablet Aláíró) egy külön gombsorban. Ez egy teljes sor zaj a Vendégek, Bérletek, Pénzügy oldalon is, mobilon két sort foglal.
- **Recepció:** az oldalfejlécben 5 gomb, alatta a státuszsor, 4 stat-kártya, ünnepi sáv, majd 3 kártya egymás alatt. A Vonalkódos beléptetésben háromsoros magyarázó szöveg és 7 „Gyors tesztkód” gomb van. A Vendégkereső minden sorában 4 gomb (Köredzés, Kezelés -1, Adatlap, QR), ettől a lista nagyon zsúfolt.
- **Vendégek:** a „Bérlet” oszlop keskeny, 3–4 sorba törik, ettől a sormagasságok egyenetlenek; a név alatti megjegyzés hosszú szürke szöveg.
- **Bérletek és termékek:** a két táblázat alatt ugyanabban a kártyában az „új” űrlap; az árak törnek („22 000 / Ft”).
- **Vendég adatlap:** 9 fül, alatta 4 oszlopos űrlap sűrűn; a mentés gomb és a feljegyzések nincsenek elválasztva.
- **Alapméretek:** táblacella 13 px és `py-2.5`, kártya `p-4`, blokkok között 16 px, `PageHeader` alatt 20 px. A UI-specifikáció (`reformstudio-ui-skill` 1.) jelenleg kifejezetten „sűrű admin felületet” ír elő; ezt is át kell írni, különben a következő munkák visszasűrítik.

## Irány

„Nyugodt, levegős admin felület”: ugyanaz a dizájnnyelv (színek, szegélyek, lekerekítés, komponensek), de **nagyobb térközök, kevesebb egyszerre látható gomb, egyértelmű hierarchia** — oldalanként egy fő művelet, a ritkábbak menübe vagy modálba kerülnek. A működés (mutációk, szkenner, socket, mock-motor) nem változik.

## Jegyek

| Jira | Cím | Típus | Méret | Függ |
| --- | --- | --- | --- | --- |
| TICKET-45 | Levegősebb alapméretek + státuszsor a fejlécbe + UI-specifikáció frissítése | IMPROVEMENT | M | – |
| TICKET-46 | Recepciós pult rendezése | IMPROVEMENT | M | TICKET-45 |
| TICKET-47 | Vendéglista és vendég adatlap rendezése | IMPROVEMENT | M | TICKET-45 |
| TICKET-48 | Bérletek és termékek, Pénzügy rendezése | IMPROVEMENT | S–M | TICKET-45 |

### TICKET-45 — Alapok (minden oldalra egyszerre hat)
1. **Térközök és betűk a `shared/ui` alapelemeiben:**
   - `PageContainer`: asztali `px-8 pt-8` (most 24 px), mobil `px-4 pt-5`.
   - `PageHeader`: alatta `mb-8` (most 20 px); leírás 14 px.
   - Blokkok közötti rés az oldalakon: `gap-6` (most `gap-4`), mobilon `gap-4`.
   - `Card`: fejléc `px-5 py-4`, törzs `p-5` (mobil `p-4`), lábléc `px-5 py-4`.
   - `Table`: cella 14 px, `px-4 py-3`; fejléc `px-4 py-2.5`; számoszlopok `whitespace-nowrap`.
   - `StatCard`: `px-5 py-4`, a címke és az érték között több hely.
   - Űrlap: mezők között 16 px, címke és mező között 6 px.
2. **Státuszsor a fejlécbe:** a QR Csatorna / Online / hang / Tablet Aláíró sor kikerül az oldalak tetejéről, és a felső fejléc jobb oldalára kerül kompakt jelzőként (állapotpötty + rövid felirat, kattintásra ugyanaz a művelet, mint most). Mobilon csak a pöttyök látszanak, a feliratok egy kis legördülőben.
3. **UI-specifikáció:** `reformstudio-ui-skill` 1. („sűrű” → „nyugodt, levegős”), 3.6 Térközök, 3.7 Betűk, 4. fejléc, `references/tokens.md`, `references/components.md` az új értékekkel.

### TICKET-46 — Recepciós pult
- Oldalfejléc: egy elsődleges gomb (**Új vendég**), a Beléptetés / Alkalom levonása / Új bérlet / Befizetés egy kisebb műveletsorban vagy „Műveletek” menüben (lásd kérdés 2).
- Vonalkódos beléptetés: a magyarázó szöveg egy rövid sorra rövidül (a többi `?` súgóba), a **Gyors tesztkódok csak Demó módban** látszanak.
- Vendégkereső sorai: **egy** gomb látszik (Köredzés), a Kezelés -1 / Adatlap / QR a sor „⋯” menüjébe kerül; a név a sorra kattintva is megnyitja az adatlapot.
- Elrendezés: bal oszlop beléptetés + utolsó vendég + kereső, jobb oszlop kassza + mai érkezések, a stat-kártyák és az ünnepi sáv fölöttük — nagyobb résekkel, hogy a szem a beléptetés mezőn kezdjen.

### TICKET-47 — Vendégek és adatlap
- Vendéglista: a Bérlet oszlop szélesebb, legfeljebb 2 sor (bérlet neve + „Havi tagság: X Ft/hó”), a megjegyzés 1 sorra vágva (teljes szöveg `title`-ben); egyenletes sormagasság.
- Szűrő-szegmens és kereső külön sorban mobilon, asztalin egy sorban több hellyel.
- Adatlap: az Áttekintés űrlapja szakaszokra bontva („Személyes adatok”, „Elérhetőség”, „Megjegyzés”), 4 helyett 2–3 oszlop, a mentés gomb a szakasz alján; a Belső feljegyzések külön kártyában.

### TICKET-48 — Bérletek és termékek, Pénzügy
- A két „Új bérletsablon” / „Új szolgáltatás” űrlap a kártyából **modálba** kerül, a kártya fejlécében „+ Új bérletsablon” / „+ Új szolgáltatás” gombbal. A táblázatok így tiszta listák.
- Árak és időtartamok nem törnek; a „Csak nőknek” jelvény a név mellé kerül.
- Pénzügy: a késési jelvények és táblák az új alapméretekkel; a kategória-összesítő egy sorban.

## Worker bontás
- **Worker A** (első, egyedül): TICKET-45 — ág: `TICKET-45`, érintett: `apps/web/src/shared/ui/*`, `widgets/app-shell/ui/AppHeader.tsx`, `pages/reception/ui/desk/ReceptionToolbar.tsx`, `pages/reception/ui/ReceptionPage.tsx`, `.claude/skills/reformstudio-ui-skill/*`.
- **Worker B, C, D** (A után, párhuzamosan, mind A ágáról indul):
  - B: `pages/reception/ui/desk/*`, `ReceptionPage.tsx` (csak a pult része)
  - C: `pages/reception/ui/guests/*`, `widgets/guest-profile/*`
  - D: `pages/reception/ui/passes/*`, `pages/reception/ui/finance/*`
  - Ütközés: csak a `entities/release-note/model/releaseNotes.ts` (mindenki a tömb elejére ír) — összevonáskor rendezem.

## Elfogadási feltételek
- Egyik oldal tetején sincs külön státuszsor; a fejlécben a jelzők működnek (QR csatorna, kijelzők, hang, tablet).
- Recepció: oldalfejlécben egy elsődleges gomb; a Vendégkereső soraiban egy látható gomb + menü; tesztkódok csak Demó módban.
- Vendéglistában egyetlen sor sem magasabb 2 szövegsornál; árak nem törnek.
- Bérletek és termékek: az új tétel modálban vehető fel, mentés után a lista frissül.
- Az alapméretek a skill 3.6 / 3.7 új értékeit követik; a skill szövege is levegős irányt ír.
- Minden működés változatlan (E2E zöld); skill 10.4: világos és sötét téma, 375 / 1024 / 1440 / 2560 px.
- CI (gate + E2E) zöld; a merge után kézi böngészős teszt a demón, képernyőképekkel.

## Újdonságok bejegyzések
- TICKET-45 → `IMPROVEMENT` — „Levegősebb felület: nagyobb térközök, a kapcsolatjelzők a fejlécbe költöztek”.
- TICKET-46 → `IMPROVEMENT` — „Átláthatóbb recepciós pult”.
- TICKET-47 → `IMPROVEMENT` — „Átláthatóbb vendéglista és adatlap”.
- TICKET-48 → `IMPROVEMENT` — „Bérletek és szolgáltatások felvétele külön ablakban”.

## Döntések (Márk, 2026-11-12: „mehet”, a javaslatok szerint)
1. Mérsékelten levegős: a fenti értékek (kb. +25–50% térköz, 14 px táblaszöveg).
2. A Recepció 4 ritkább gombja kisebb gombsorban látható marad (nem menü).
3. A Gyors tesztkódok csak Demó módban látszanak.
4. A Vendégmonitor, a bejelentkezés és a tablet kimarad ebből a körből.
