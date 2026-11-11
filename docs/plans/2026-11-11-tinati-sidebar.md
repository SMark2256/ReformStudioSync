# Terv — 2026-11-11 (tinati oldalsáv, Beállítások)

Állapot: Folyamatban

Az alkalmazáskeret oldalsávja a tinati projekt (`E:/Projects/Bildr/tinati`, `src/client/widgets/app-shell`) oldalsávját követi, a fiókpanelből Beállítások oldal nyílik témával és felületszínnel. Döntések (Megrendelő, 2026-11-11): tinati-hű kinézet, a `reformstudio-ui-skill` ehhez igazodik; kész felületszín-paletták világos és sötét árnyalattal, egyedi szín nélkül; mentés a böngészőben (localStorage).

## Jegyek
| Jira | Cím | Típus | Méret | Függ |
| --- | --- | --- | --- | --- |
| TICKET-28 | UI: tinati-féle oldalsáv, fiókpanel és Beállítások (téma, felületszín) | NEW_FEATURE | L | – |

## Worker bontás
- Worker A (egyedül): TICKET-28 — ág: TICKET-28, `origin/demo`-ról. Érintett:
  - `apps/web/src/widgets/app-shell` (oldalsáv, fiókpanel, oldalsáv-állapot, `AppShell`, `AppHeader`)
  - `apps/web/src/shared/theme` (felületszín a mostani `accent` helyett), `apps/web/src/app/ThemeSync.tsx`, `apps/web/src/app/styles/index.css`, `apps/web/index.html`
  - `apps/web/src/shared/config` (`settings` útvonal), `apps/web/src/app/App.tsx`
  - új `apps/web/src/pages/settings`
  - `apps/web/src/shared/ui/sidebar.tsx` (ha az új oldalsáv már nem használja, kivezetni)
  - `apps/web/src/pages/ui-preview` (a kiemelőszín-választó a felületszínre áll át)
  - `.claude/skills/reformstudio-ui-skill/SKILL.md` + `references/tokens.md`, `references/components.md`
  - `apps/web/src/pages/reception/model/releaseNotes.ts`

### Részletek a workernek

**Oldalsáv (tinati `sidebar.tsx`, `sidebar-navigation.tsx`, `use-sidebar-state.ts` mintájára)**
- Sötét, lebegő kártya mindkét témában: a széltől 8 px (md-től 12 px), `rounded-[14px]`, árnyék, `--sidebar` / `--sidebar-raised` / `--sidebar-foreground` / `--sidebar-muted-foreground` / `--sidebar-border` tokenek. A tartalom a kártya mellett indul (`--sidebar-offset`), a fejléc a kártya mellett fut.
- Szélesség 236 px nyitva, 64 px ikonsáv. 1280 px-től alapból nyitva, alatta ikonsáv; a választás sávonként (keskeny / széles) a localStorage-ban mentődik.
- Összecsukva egér fölé húzásra vagy billentyűzetes fókuszra kinyílik a tartalom fölött (peek), kívül kattintásra, elhagyásra, fókuszvesztésre és navigáláskor visszacsukódik. Érintésnél csak a kívüli koppintás csukja.
- Fejrész: összecsukva „RS” jel, nyitva „ReformStudio Sync” felirat; összecsukó gomb (`PanelLeft`, `aria-label` „Oldalsáv összecsukása” / „Oldalsáv kinyitása”, `aria-expanded`). `Ctrl+B` marad.
- Menü: a meglévő `NAV_GROUPS` (Napi működés, Ügyfelek), szakaszcím nyitva, 1 px elválasztó összecsukva; aktív pont a felületszín halvány árnyalatával (`--sidebar-accent`) és a világos árnyalatú szöveggel, `aria-current="page"`; a Vendégmonitor továbbra is külön ablakban nyílik. Újdonságok (számlálóval) és Demó mód a munkatárs fölött marad.
- Lábrész: munkatárs sora (avatar, név, szerepkör, `CaretUp`-szerű nyíl, `aria-expanded`); kattintásra a sor mögül alulról felcsúszó fiókpanel: felül az e-mail / szerepkör, **Beállítások** (`/settings`), **Téma** kapcsoló (`role="switch"`, Világos/Sötét ikon-szegmens, a panel nyitva marad), elválasztó, **Kijelentkezés**. Esc, kívüli kattintás, navigálás és az oldalsáv csukódása bezárja; billentyűzettel nyitva a fókusz a panel első elemére kerül.
- Alatta a futó verzió (`widgets/version-changelog` verziószáma), összecsukva rövid alakban; az Újdonságokra visz.
- Mobilon (768 px alatt) a mostani kihúzható menü marad (fejléc menü gomb, sötétített háttér), de ugyanazzal a sötét kártya-kinézettel és fiókpanellel.
- Mozgás: új függőség (pl. `motion`) nélkül, CSS átmenettel: szélesség 200 ms, fiókpanel felcsúszás ~300 ms; `prefers-reduced-motion` esetén ki. Ikonok `lucide-react`, `strokeWidth={1.75}`.

**Téma és felületszín**
- Felületszín-paletták (`data-surface` a `<html>`-en, HSL-hármasok, világos és sötét árnyalat): Kékeszöld (alapértelmezett), Kék, Indigó, Bordó, Borostyán, Olajzöld. Mindegyik állítja: `--primary`, `--primary-foreground`, `--ring`, a halvány kiemelő változatokat és az oldalsáv kiemelését (`--sidebar-highlight`, `--sidebar-accent`). Sötét témában a világos árnyalat a `--primary`, sötét felirattal. A Vendégmonitorra nem hat.
- A mostani `useAccentStore` (hexa) helyett felületszín store (localStorage); a régi mentett hexa, ha egy preset, átfordul a megfelelő palettára, különben az alapértelmezett lesz.
- `index.html` inline script: a mentett téma és felületszín az első kirajzolás előtt beáll (nincs villanás).
- Mentéskor egy közös toast („Megjelenés mentve”, a választott értékkel), gyors egymás utáni váltásnál ugyanaz frissül.

**Beállítások oldal (`/settings`, `pages/settings`)**
- `PageHeader`: „Beállítások” / „A megjelenés ezen a gépen mentődik.”
- „Megjelenés” kártya, kétoszlopos beállítássorok (skill 6.9): **Téma** szegmens (Világos · Sötét); **Felületszín** színminták (a minta a saját `data-surface`-ével a saját palettáját mutatja, `aria-label` a névvel, kijelölt állapot); **Oldalsáv** `Switch` „Összecsukott oldalsáv” (az aktuális sáv beállítása).
- „Stúdió adatai” kártya most nem készül (nincs hozzá API) — külön jegy.

**Skill frissítés**: `reformstudio-ui-skill` 1. (a lebegő oldalsáv kártya kivétel a lekerekítés/árnyék tiltás alól), 3.4 (felületszínek táblázata világos/sötét értékkel), 3.9 (peek, fiókpanel), 4.–4.2 (új keret, fiókpanel, verzió), 6.9 (Beállítások), `references/tokens.md`, `references/components.md`.

**Szabályok**: FSD rétegek, magyar szöveg, világos és sötét téma, helyi gate/teszt nincs (a CI ellenőriz), commit után jelentés.

## Elfogadási feltételek
- Az oldalsáv nyitva és ikonsávként is a tinati szerint néz ki és működik (peek, összecsukás mentése sávonként, fiókpanel, verzió).
- A fiókpanelből a Beállítások megnyílik; a Téma kapcsoló a panelen és az oldalon is azonnal vált.
- A felületszín azonnal átszínezi a gombokat, aktív menüpontot, fókuszgyűrűt és jelölőket, világos és sötét témában is olvashatóan; újratöltés után villanás nélkül megmarad.
- A Vendégmonitor és a bejelentkezés kinézete nem változik (bejelentkezésnél a mentett téma és szín érvényes).
- Billentyűzettel minden elérhető (peek fókuszra, Esc zárja a panelt), mobilon a kihúzható menü működik.
- A skill 10.4 ellenőrzőlistája: világos/sötét, 375 / 1024 / 1440 / 2560 px.
- CI (gate + E2E) zöld.

## Újdonságok bejegyzések
- TICKET-28 → `NEW_FEATURE`, link: `{ type: 'route', path: '/settings' }` — „Új oldalsáv és Beállítások: téma és felületszín”.

## Nyitott kérdések a Megrendelőnek
- Nincs. (Jira: az új jegy először TICKET-25 számot kapott, ami a gitben foglalt volt; a TICKET-25–27 utólag felvéve és lezárva, az oldalsáv jegye TICKET-28.)
