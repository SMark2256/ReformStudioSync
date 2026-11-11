---
name: reformstudio-ui-skill
description: A ReformStudioSync webes felületének (apps/web) teljes UI-specifikációja shadcn/ui alapon - színek (világos/sötét, hexa és HSL), lekerekítések, térközök, betűméretek, árnyékok, ikonok, a sötét, lebegő oldalsáv (fiókpanel, peek) minden menüpontja, a fejléc, minden komponens (háromféle gomb: elsődleges, másodlagos, link; mezők, táblázat, jelvény, modál, toast) és minden oldal (Recepció, Vendégmonitor, Órarend, Vendégek, Bérletek és termékek, Felhasználókezelés, Szerepkörök és jogok, Beállítások: téma és felületszín) pontos felépítése, plusz akadálymentesség és reszponzív viselkedés (mobil, tablet, asztali, max. 1400 px középre igazított tartalom). Használd mindig, ha az apps/web felületén bármit építesz vagy módosítasz - új oldal, komponens, űrlap, táblázat, modál, menüpont, admin felület -, ha a felhasználó a kinézetet, a gombokat, a menüt, a színeket, a témát, a mobil nézetet vagy az akadálymentességet említi, vagy ha egy oldalt az új UI-ra kell átállítani („állítsd át az új UI-ra”, „legyen olyan, mint a prototípus”), akkor is, ha a „UI” vagy „skill” szó nem hangzik el.
---

# ReformStudioSync UI-specifikáció

Ez a skill azt írja le, **hogyan nézzen ki és viselkedjen** az `apps/web` felülete,
a legkisebb részletig. A ticketfolyamatot (ág, gate, PR) továbbra is a
`reform-ticket` skill viszi. Ez a skill annak a 3. (implementáció) és 4.
(ellenőrzés) fázisában érvényes. Ha az `impeccable` skill is fut, a vizuális
döntésekben ez a skill az irányadó.

A látványterv kattintható formában: `references/prototype/index.html`. Nyisd meg
böngészőben, mielőtt egy oldalt átállítasz. Ha egy részlet itt és a
prototípusban eltér, **ez a dokumentum az irányadó**.

A felhasználóval magyarul beszélj. A felületi szöveg magyar, a meglévő hangnemben.

## 1. Az irány egy mondatban

Hagyományos, nyugodt, sűrű admin felület: fehér/szürke felületek, vékony 1 px-es
szegélyek, 6 px-es lekerekítés, táblázatok és űrlapmezők, **egy** kiemelő szín.

**Tilos:** színátmenet, üvegeffekt (`backdrop-blur`), dekoratív kör vagy blob,
emoji a felületen, pasztell kártyahalmaz, túlméretezett lekerekítés (`rounded-2xl`
és fölötte), túlméretezett árnyék, csillogó „AI” ikonok (`Sparkles`), animált
háttér, minden kártyán más szín.

**Kivétel:** az oldalsáv sötét, lebegő kártya mindkét témában, 14 px-es
lekerekítéssel (`rounded-[14px]`) és saját árnyékkal (4.1). Ez az egyetlen hely,
ahol ez megengedett; máshol a `rounded-[14px]` és a nagy árnyék tilos.

## 2. Mikor melyik részlet

| Kérdés | Fejezet | Kód és telepítés |
| --- | --- | --- |
| Milyen színt, lekerekítést, méretet használjak? | 3. Tokenek | `references/tokens.md` |
| Hogy néz ki az oldalsáv, a fejléc, a keret? | 4. Keret | `references/components.md` |
| Hogy néz ki egy gomb, mező, táblázat, modál? | 5. Komponensek | `references/components.md` |
| Mi van egy adott oldalon? | 6. Oldalak | |
| Állapotok, szövegek, üres és hibás állapot | 7. Állapotok és szövegek | |
| Akadálymentesség | 8. | `references/accessibility.md` |
| Mobil, tablet, széles monitor | 9. | `references/responsive.md` |
| shadcn/ui telepítése | 10. Munkamenet | `references/setup.md` |

## 3. Tokenek

Minden szín CSS-változóból jön (shadcn HSL-hármasok, `references/tokens.md`).
Komponensben **csak tokenosztály**: `bg-background`, `bg-card`, `bg-muted`,
`text-foreground`, `text-muted-foreground`, `border-border`, `border-input`,
`bg-primary`, `text-primary-foreground`, `ring-ring`, `text-success`,
`text-warning`, `text-destructive`. Nyers Tailwind szín (`bg-slate-50`,
`text-emerald-700`, `bg-white`) új vagy átállított kódban nem lehet.

### 3.1 Színek: világos téma

| Token | Hex | Mire |
| --- | --- | --- |
| `background` | `#f5f6f8` | oldal háttere (a kártyák mögött) |
| `card` / `popover` | `#ffffff` | kártya, modál, legördülő, fejléc (az oldalsáv saját sötét tokeneket kap, 4.1) |
| `muted` | `#f0f2f5` | táblafejléc, sor hover, szegmens aktív háttere, avatar háttér |
| `foreground` | `#1b222c` | alap szöveg, címek |
| `muted-foreground` | `#556170` | leírások, címkék, táblafejléc szövege, másodlagos adatok |
| `faint` (csak csoportcímkék) | `#6a7482` | oldalsáv csoportcímkéi, segédszöveg |
| `border` | `#dde1e7` | kártya, táblasor, elválasztó |
| `input` | `#c5cbd3` | mezők és a másodlagos gomb kerete |
| `primary` | `#0f766e` | **kiemelő szín**, a felületszín adja (3.4): elsődleges gomb, link, fókuszgyűrű, jelölőnégyzet |
| `primary-foreground` | `#ffffff` | szöveg a kiemelő színen |
| `success` | `#15803d` | érvényes, aktív, bent van |
| `warning` | `#b45309` | hamarosan lejár, telt ház |
| `destructive` | `#b91c1c` | lejárt, elutasítva, hibaüzenet |

### 3.2 Színek: sötét téma (`.reception-theme-dark`)

| Token | Hex |
| --- | --- |
| `background` | `#0e1115` |
| `card` / `popover` | `#161a20` |
| `muted` | `#1d222a` |
| `foreground` | `#e5e8ec` |
| `muted-foreground` | `#a3adba` |
| `faint` | `#8b96a3` |
| `border` | `#2a313b` |
| `input` | `#3a424e` |
| `primary` | a felületszín világos árnyalata (3.4) |
| `primary-foreground` | `#0e1115` (sötét felirat a világos árnyalaton) |
| `success` | `#4ade80` |
| `warning` | `#fbbf24` |
| `destructive` | `#f87171` |

Sötét témában a felületszín világos árnyalata a `--primary`: kitöltésként (elsődleges
gomb) sötét felirattal, szövegként (link gomb) és kijelölésként a sötét kártyán is
olvasható. Külön világosítás (`color-mix`) nincs.

### 3.3 Halvány változatok

Állapotháttérhez soha ne telített színt használj, hanem átlátszó változatot:

| Mire | Osztály |
| --- | --- |
| Kijelölt táblasor | `bg-primary-soft` (`primary` 10%, sötétben 16%) |
| Aktív menüpont háttere (sötét oldalsáv) | `bg-sidebar-accent` (a világos árnyalat 14%-a) |
| Fókuszgyűrű mezőn | `ring-[3px] ring-primary/15` + `border-primary` |
| Jelvény hátterek | `bg-success/10`, `bg-warning/10`, `bg-destructive/10` |
| Jelvény keretek | `border-success/30`, `border-warning/30`, `border-destructive/30` |
| Hibadoboz (`Alert` hiba) | `bg-destructive/10 border-destructive/35 text-destructive` |
| Infódoboz (`Alert` info) | `bg-primary/10 border-primary/35 text-foreground` |

### 3.4 Felületszínek (Beállítások)

Kész paletták, mindegyik egy telített színnel (világos téma `--primary`) és egy
világos árnyalattal (sötét téma `--primary`, és mindkét témában az oldalsáv
kiemelése, `--sidebar-highlight`). A `<html>` `data-surface` attribútuma választ
(`shared/theme/surface.ts`, `app/styles/index.css`); a felirat a színen világos
témában fehér, sötétben `#0e1115`.

| Név | `data-surface` | Világos téma | Sötét téma / oldalsáv kiemelés |
| --- | --- | --- | --- |
| Kékeszöld (alapértelmezett) | `teal` | `#0f766e` | `#2dd4bf` |
| Kék | `blue` | `#1d4ed8` | `#60a5fa` |
| Indigó | `indigo` | `#4338ca` | `#818cf8` |
| Bordó | `burgundy` | `#9d174d` | `#f472b6` |
| Borostyán | `amber` | `#b45309` | `#fbbf24` |
| Olajzöld | `olive` | `#3f6212` | `#a3e635` |

Egyedi színválasztó nincs. A választás ezen a gépen mentődik (localStorage), és az
`index.html` inline scriptje az első kirajzolás előtt beállítja (nincs villanás). A
korábban mentett kiemelő szín (hexa), ha egy preset volt, a megfelelő palettára
fordul, különben az alapértelmezett lesz. A felületszín a Vendégmonitorra nem hat.

### 3.5 Lekerekítések

| Elem | Érték | Tailwind |
| --- | --- | --- |
| Gomb, mező, legördülő, szegmens, jelölőnégyzet kerete, menüpont | 6 px | `rounded-md` (`--radius: 0.375rem`) |
| Kártya, modál, oldalsáv logó, monitor keret belső része | 8 px | `rounded-lg` |
| Jelvény (`Badge`) | 4 px | `rounded-sm` |
| Haladásjelző sáv | 4 px | `rounded-sm` |
| Avatar, állapotpötty, számláló a menüben | kör | `rounded-full` |
| Jelölőnégyzet | 4 px | `rounded-sm` |
| Színminta (Beállítások) | 6 px | `rounded-md` |
| Mobil teljes képernyős modál | 0 | `rounded-none` |
| Oldalsáv kártya (asztali és mobil) | 14 px | `rounded-[14px]`, csak itt |
| Fiókpanel (az oldalsáv alján) | 8 px felül | `rounded-t-lg` |
| Toast | 6 px | `rounded-md` |

Nagyobb lekerekítés (`rounded-xl`, `rounded-2xl`, `rounded-3xl`) **sehol**; az
oldalsáv kártya `rounded-[14px]`-e az egyetlen kivétel (1.).

### 3.6 Térközök

4 px-es alapegység (Tailwind alapskála). A használt értékek:

| Hol | Érték |
| --- | --- |
| Oldal belső margója | asztali `px-6 py-6` (24 px), mobil `px-3 py-4` (12/16 px) |
| Blokkok közötti rés (rácsok) | `gap-4` (16 px), mobilon a stat-kártyák között `gap-2.5` (10 px) |
| Kártya fejléc | `px-4 py-3` |
| Kártya törzs | `p-4` (mobilon `p-3.5`) |
| Táblacella | `px-3 py-2.5` (12 × 10 px), fejléccella `px-3 py-2` |
| Gombok egymás mellett | `gap-2` (8 px) |
| Űrlapmezők egymás alatt | `mb-3.5` (14 px) mezőnként, címke és mező között `gap-1.5` |
| PageHeader alatt | `mb-5` (20 px) |
| Menüpontok között | `space-y-0.5` (2 px), szakaszok között `mt-3` |

### 3.7 Betűk

- Betűtípus: rendszerbetű, nem töltünk be webfontot:
  `"Segoe UI", "Segoe UI Variable Text", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif`.
- Monospace (idő, kártyaszám, hexa kód):
  `"Cascadia Mono", Consolas, "SF Mono", monospace`.
- Számok táblázatban és stat-kártyán: `tabular-nums`.

| Elem | Méret / sor | Vastagság | Szín |
| --- | --- | --- | --- |
| Alap szöveg | 14 px / 1.45 (`text-sm`) | 400 | `foreground` |
| `h1` oldalcím | 20 px (`text-xl`) | 600 | `foreground` |
| Oldal leírása a `h1` alatt | 13 px | 400 | `muted-foreground` |
| `h2` kártyacím | 14 px | 600 | `foreground` |
| `h3` alblokk, beállítássor címe | 13 px | 600 | `foreground` |
| Kis címke (stat, mező felett, `lbl`) | 12 px (`text-xs`) | 600 | `muted-foreground` |
| Szakaszcím az oldalsávban | 12 px (`text-xs`) | 500 | `sidebar-muted` |
| Táblafejléc | 12 px | 600 | `muted-foreground` |
| Táblacella | 13 px | 400 | `foreground` |
| Stat érték | 24 px (mobil 20 px) | 600 | `foreground` |
| Gombfelirat | 13 px (`sm`: 12 px) | 600 | variáns szerint |
| Jelvény | 12 px | 500 | állapot szerint |
| Monospace adat | 12 px | 400 | `muted-foreground` |

Dőlt betű, csupa nagybetűs szöveg és 700 feletti vastagság nincs (az oldalsáv
„RS” jele 700).

### 3.8 Szegélyek, árnyékok, rétegek

- Szegély mindenhol 1 px. Kártya: `border-border`. Mező és másodlagos gomb:
  `border-input`.
- Árnyékok, csak ezek:
  - kártya, másodlagos gomb: `shadow-sm` (`0 1px 2px rgba(16,24,40,.06)`;
    sötétben `rgba(0,0,0,.4)`);
  - modál, legördülő, tooltip: `shadow-lg`;
  - mobil kihúzott oldalsáv: `0 0 40px rgba(0,0,0,.25)`;
  - oldalsáv kártya: `0 12px 32px rgba(15,18,24,.28)`, peek közben
    `0 18px 48px rgba(15,18,24,.45)`; fiókpanel: `0 -6px 24px rgba(0,0,0,.35)`.
- Rétegek (`z-index`): fejléc 10, oldalsáv kártya 20, mobil menü (háttér és
  panel, Radix `Sheet`) 50, modál 50, toast 60, „Ugrás a tartalomra” 100.
- Modál háttere: `bg-black/45`, elmosás nélkül.

### 3.9 Mozgás

- Átmenet csak színre és háttérre: `transition-colors` 150 ms.
- Oldalsáv nyitás/csukás és peek: a kártya szélessége 200 ms `ease-in-out`, a
  tartalom bal margója és a fejléc bal belső margója ugyanígy. A feliratok,
  szakaszcímek és az „RS” jel / név átváltása `opacity` 200 ms.
- Peek: ikonsávban egér fölé húzásra vagy billentyűzetes fókuszra a kártya a
  tartalom fölött kinyílik (a tartalom nem mozdul); elhagyásra, kívüli
  kattintásra, fókuszvesztésre és navigáláskor visszacsukódik. Érintésnél csak a
  kívüli koppintás csukja.
- Fiókpanel: a munkatárs sora mögül alulról felcsúszik (`translateY(105%)
  scale(.94)` → `0 / 1`), nyitás 300 ms `cubic-bezier(.22,1,.36,1)`, zárás 240 ms;
  a nyíl 180°-ot fordul.
- Mobil menü: `translateX` 200 ms.
- Mindez CSS-átmenet, animációs könyvtár (`motion`, `framer-motion`) nincs. Egyetlen
  kivétel a Vendégmonitor születésnapi konfettije (`entities/check-in/ui/BirthdayConfetti.tsx`,
  `motion/react` + `LazyMotion`, TICKET-36): máshol ne használd.
- Modál: a shadcn alap fade/zoom, ne bővítsd.
- Toast: 200 ms becsúszás alulról.
- `prefers-reduced-motion: reduce` esetén minden animáció és átmenet ki.
- Nincs ugráló, pulzáló, forgó dísz. Betöltés: `Skeleton`, nem spinner a
  tartalom helyén.

### 3.10 Ikonok

- Könyvtár: `lucide-react` (már a függőségek között van). Más ikonkészlet nincs.
- Méret: 18 px a menüben és a fejlécben, 16 px gombban (`[&_svg]:size-4`).
- Vonalvastagság: 1.75 (`strokeWidth={1.75}`).
- Minden ikon `aria-hidden`. Ikon önmagában csak ikon gombban lehet, ott
  `aria-label` kötelező.
- Ikon gomb mellett szövegben nincs emoji, és dísznek sem kerül ikon a címek elé.

## 4. Alkalmazáskeret

`widgets/app-shell`: `AppShell` → `AppSidebar` (asztali lebegő kártya) vagy
`MobileSidebar` (768 px alatt, `Sheet`), `AppHeader`, `PageContainer` a
`<main>`-en. A DOM-ban pontosan egy `header`, egy fő `nav` és egy `main` van. A
Vendégmonitor (`/monitor`) és a bejelentkezés **nem** kapja meg a keretet.

```
 8/12 px                     a fejléc háttere a kártya alatt fal a falig fut
┌──────────────┐┌───────────────────────────────────────────────────────┐
│ RS / név  [▯]││ Fejléc (56 px) ☰ ReformStudio Sync / Recepció  dátum ☀│
├──────────────┤├───────────────────────────────────────────────────────┤
│ Napi működés ││   ┌───────────── max. 1400 px, középen ─────────────┐ │
│  Recepció    ││   │ PageHeader: h1 + leírás           [műveletek]   │ │
│  …           ││   │ Kártyák, táblázatok …                           │ │
│ Ügyfelek     ││   └─────────────────────────────────────────────────┘ │
│  …           ││                                                       │
│ Újdonságok 3 ││                                                       │
│ Demó mód     ││                                                       │
├──────────────┤│                                                       │
│ (KA) Név  ˄  ││                                                       │
│ Verzió 0.3   ││                                                       │
└──────────────┘│                                                       │
 sötét kártya, 236 px (ikonsáv 64 px), a széltől 8 px (md-től 12 px)
```

### 4.1 Oldalsáv méretei

| Rész | Érték |
| --- | --- |
| Kártya | `fixed`, a széltől `--sidebar-inset` (8 px, md-től 12 px) felül, alul és balra; `rounded-[14px]`, `ring-1 ring-sidebar-border`, árnyék (3.8), `z-20` |
| Szélesség nyitva / ikonsáv | 236 px / 64 px; a belső oszlop mindig 236 px, a kártya levágja |
| Tartalom és fejléc | a tartalom bal margója és a fejléc bal belső margója `--sidebar-offset` (= szélesség + 2 × inset); peek közben nem változik |
| Kezdőállapot | 1280 px-től nyitva, alatta ikonsáv; a választás sávonként (keskeny / széles) a localStorage-ban (`reform_studio_sidebar`) |
| Tokenek | `--sidebar` (#171b21, sötét témában #0b0e12), `--sidebar-raised` (fiókpanel), `--sidebar-foreground`, `--sidebar-muted-foreground`, `--sidebar-border`, `--sidebar-hover` (fehér 6%), `--sidebar-highlight` és `--sidebar-accent` (a felületszínből, 3.4) |
| Fejrész | 56 px, alsó `sidebar-border` szegély, `pl-5 pr-3`: ikonsávban „RS” jel (15 px 700 `sidebar-highlight`, a menüikonok tengelyében), nyitva „ReformStudio Sync” (15 px 600); jobbra az összecsukó gomb |
| Összecsukó gomb | `SidebarItem variant="icon"` (32 px), `PanelLeft` ikon, `aria-label` „Oldalsáv összecsukása” / „Oldalsáv kinyitása”, `aria-expanded`; ikonsávban kívül esik a sávon (a fókusz előbb kinyitja a peeket). Billentyű: `Ctrl+B` |
| Menü | `nav aria-label="Főmenü"`, `px-3 py-3`, függőlegesen görgethető |
| Menüpont | `SidebarItem variant="nav"`: 36 px (érintőn 44 px), `px-3`, ikon és szöveg között 12 px, 14 px 500 `sidebar-muted`; ikonsávban 40 px-es négyzet |
| Lábrész | felső `sidebar-border` szegély, `px-2 pt-2 pb-1.5`: munkatárs sora (44 px) és alatta a verzió (24 px) |
| Mobilon | 300 px (max. 86vw), ugyanaz a sötét kártya 8 px-re a szélektől, kihúzható, sötétített háttérrel |

### 4.2 Menüpontok

Pontosan ezek, ebben a sorrendben. Ha egy útvonal még nincs, az új route-ot ezen
a néven hozd létre; a még nem létező oldal nem kerül a menübe.

| Szakasz | Felirat | Ikon (lucide) | Útvonal | Jog |
| --- | --- | --- | --- | --- |
| Napi működés | Recepció | `ConciergeBell` | `/reception` | mindenki |
| Napi működés | Vendégmonitor | `MonitorSmartphone` | `/monitor` (külön ablakban) | mindenki |
| Napi működés | Órarend | `CalendarDays` | `/schedule` | mindenki |
| Ügyfelek | Vendégek | `Users` | `/guests` | mindenki |
| Ügyfelek | Bérletek és termékek | `Ticket` | `/passes` | mindenki (szerkesztés: `prices`) |
| Ügyfelek | Pénzügy | `Wallet` | `/finance` | mindenki |
| Adminisztráció | Felhasználókezelés | `UserCog` | `/admin/users` | `users` |
| Adminisztráció | Szerepkörök és jogok | `ShieldCheck` | `/admin/roles` | `roles` |

A **Monitorok** (`/monitors`) és a **Beállítások** (`/settings`) nem a menüben, hanem a
fiókpanelben van.

A menü alján, a munkatárs fölött:

| Felirat | Ikon | Útvonal / művelet |
| --- | --- | --- |
| Újdonságok | `Megaphone` | `/news` (`releaseNotes.ts`); olvasatlannál számláló, ikonsávban pötty |
| Demó mód | `FlaskConical` | `/demo` |

**Menüpont állapotai**

| Állapot | Kinézet |
| --- | --- |
| Alap | `text-sidebar-muted`, átlátszó háttér |
| Hover | `bg-sidebar-hover text-sidebar-foreground` |
| Aktív | `bg-sidebar-accent text-sidebar-highlight font-semibold` (a felületszín halvány és világos árnyalata), `aria-current="page"` |
| Fókusz | 2 px belső gyűrű `ring-sidebar-highlight` (a kártya levágná a külsőt) |
| Nincs jog | 60% átlátszóság, jobb szélen 14 px `Lock` ikon, `aria-disabled="true"`; kattintásra toast: „Ehhez a menüponthoz admin jogosultság kell” |
| Számláló | jobb szélen `rounded-full border-sidebar-border bg-sidebar-raised px-1.5 text-[11px] text-sidebar-muted`, a felolvasónak `sr-only` „(N olvasatlan)” |

**Ikonsáv módban** csak az ikon látszik; a felirat elhalványul (`opacity-0`), de a
link neve marad (felolvasó, tesztek). A szakaszcímek helyén 1 px-es vízszintes
elválasztó, ugyanabban a 16 px-es dobozban. A lábrészben csak az avatar és a
verzió rövid alakja („v0.3”) látszik.

**Lábrész**

- Munkatárs sora: `section aria-label="Bejelentkezett felhasználó"`, benne egy
  gomb (`aria-label="Fiók és beállítások: {név}"`, `aria-expanded`,
  `aria-controls`): 32 px-es kör avatar (`bg-sidebar-raised border-sidebar-border`),
  a név 13 px 600 és a szerepkör 12 px `sidebar-muted`, jobbra `ChevronUp`.
- **Fiókpanel**: kattintásra a sor mögül felcsúszik (3.9), `bg-sidebar-raised`,
  `rounded-t-lg`, felső és oldalsó `sidebar-border` szegély. Tartalma: felül az
  e-mail (12 px `sidebar-muted`), **Monitorok** (`MonitorCog`, `/monitors`; jobb szélen
  13 px `Monitor` ikon és a jelenleg aktív kijelzők száma, 12 px `sidebar-muted`
  `tabular-nums`, a felolvasónak `sr-only` „(N aktív)”), **Beállítások** (`Settings`, `/settings`), **Téma**
  (`role="switch"`, `aria-checked`, `aria-label="Sötét téma"`, jobbra Világos/Sötét
  ikon-szegmens; a panel nyitva marad), elválasztó, **Kijelentkezés** (`LogOut`).
  Elemei `SidebarItem` (36 px, `px-2.5`, 16 px ikon).
- A panelt Esc (a fókusz a sorra kerül vissza), kívüli kattintás, navigálás és az
  oldalsáv csukódása zárja. Billentyűzettel nyitva a fókusz a panel első elemére
  kerül. Mobilon nyitott panelnél az Esc csak a panelt zárja.
- **Verzió**: a sor alatt a futó verzió („Verzió 0.3”, ikonsávban „v0.3”), 12 px
  `sidebar-muted` `tabular-nums`, link az Újdonságokra. Az értéke a gyökér
  `package.json` verziója major.minor alakban (`shared/config`: `APP_RELEASE_VERSION`).

### 4.3 Fejléc

- 56 px magas, `bg-card border-b border-border`, `sticky top-0 z-10`. A háttere
  a lebegő oldalsáv alatt a teljes szélességen fut, a tartalma
  `pl-[var(--sidebar-offset)]`-tól.
- A tartalma ugyanabban a 1400 px-es, középre igazított sávban van, mint az oldal
  (lásd 9.).
- Bal oldal: mobilon a menü gomb (`Menu` ikon, `aria-label="Menü megnyitása"`),
  utána `Breadcrumb`: „ReformStudio Sync” / **oldal neve** (13 px; az utolsó elem
  600 `foreground`, `aria-current="page"`). Mobilon csak az oldal neve.
- Jobb oldal: dátum és idő 12 px `muted-foreground` („november 10., kedd, 22:55”,
  mobilon rejtve), téma gomb (`Button variant="secondary" size="icon"`, `Moon` /
  `Sun`, `aria-pressed`).
- A fejlécben nincs kereső, nincs értesítési harang, nincs második avatar.

### 4.4 Oldaltartalom

- `PageContainer`: `mx-auto w-full max-w-[1400px] px-6 py-6` (mobil `px-3 py-4`),
  alul 72 px hely.
- `PageHeader`: bal oldalt `h1` és alatta egy mondatos leírás, jobb oldalt a
  műveletek (`gap-2`), alsó igazítással. Alatta 20 px. Mobilon a műveletek a cím
  alá kerülnek, teljes szélességben.
- Oldalanként legfeljebb egy `primary` gomb a `PageHeader`-ben.

## 5. Komponensek

Minden a `@/shared/ui`-ból. Saját primitív csak akkor, ha a shadcn-ben nincs.

### 5.1 Gombok: pontosan három variáns

Nincs `destructive`, `ghost`, `outline`, `default` variáns, és nem is hozható
létre. Nyers `<button>` csak a `shared/ui`-n belül. A kód:
`references/components.md`.

| | `primary` | `secondary` | `link` |
| --- | --- | --- | --- |
| Mire | a nézetrész fő művelete (legfeljebb egy) | minden más művelet | navigáció, másodrangú művelet szövegben vagy táblasorban |
| Háttér | `bg-primary` | `bg-card` | nincs |
| Szöveg | `text-primary-foreground`, 13 px 600 | `text-foreground`, 13 px 600 | `text-primary`, 13 px 600, aláhúzva (1 px, 3 px eltolással) |
| Keret | 1 px `border-primary` | 1 px `border-input` + `shadow-sm` | nincs |
| Magasság | 34–36 px (`h-9`), `sm`: 28–32 px, érintőn 44 px | ugyanígy | szövegmagasság, érintőn min. 44 px |
| Belső margó | `px-4` (`sm`: `px-3`) | ugyanígy | 0 |
| Lekerekítés | 6 px | 6 px | – |
| Hover | 7%-kal sötétebb (`hover:bg-primary/90`) | `hover:bg-muted` | aláhúzás 2 px |
| Fókusz | 2 px gyűrű `ring-foreground` (kontraszt a kitöltésen) | 2 px `ring-ring` | 2 px `ring-ring` |
| Letiltva | 50% átlátszóság, `cursor-not-allowed` | ugyanígy | ugyanígy |
| Ikon | bal oldalt 16 px, 7 px réssel | ugyanígy | nincs |

- **Ikon gomb:** `secondary`, `size="icon"`, 34 × 34 px (érintőn 44 × 44),
  `aria-label` kötelező.
- **Veszélyes művelet** (sztornó, letiltás, törlés): `secondary` gomb, és
  `AlertDialog` kér megerősítést. Ott a megerősítő gomb `primary`, a felirata a
  műveletet mondja ki („Beléptetés sztornózása”), nem „OK” vagy „Igen”.
- **Jog nélkül:** a gomb letiltva látszik, a köré tett `span tabIndex={0}` kap
  `Tooltip`-et az okkal („Nincs jogosultságod ehhez”).
- Gombfelirat ige, rövid: „Beléptetés”, „Hosszabbítás”, „Új vásárlás”,
  „Fizetés rögzítése”, „Mentés”, „Mégse”. Nincs „Kattints ide”, nincs felkiáltójel.
- Sorrend: a `primary` mindig a sor **végén** (jobbra), előtte a `secondary`-k,
  a `link` külön sorban vagy a kártya fejlécében.

### 5.2 Szövegmező, kereső, legördülő

- Magasság 34 px (érintőn 44 px, 16 px betűvel), `rounded-md`, 1 px `border-input`,
  `bg-card`, `px-2.5`, 13 px.
- Fókusz: `border-primary` + 3 px `ring-primary/15`, nincs böngésző-outline.
- Letiltva: 50% átlátszóság, `bg-muted`.
- Hibás: `border-destructive`, alatta 12 px `text-destructive` üzenet.
- Címke a mező fölött: 12 px 600 `muted-foreground`, közte 5 px.
- Kereső: bal oldalt 16 px `Search` ikon 10 px-re a széltől, a szöveg 34 px-ről
  indul, `type="search"`, `sr-only` címke. Szélesség asztalin 320 px, tableten
  240 px, mobilon 100%.
- Legördülő (`Select`): ugyanaz a doboz, jobb oldalt `ChevronDown` 16 px. A
  lenyíló lista `bg-popover border shadow-lg rounded-md`, elemek 32 px, kijelölt
  elem előtt `Check` ikon.
- Táblán belüli kis mező (ár): 28 px magas, 110 px széles, jobbra igazított szám.

### 5.3 Jelölőnégyzet, rádió, szegmens, kapcsoló

- Jelölőnégyzet és rádió: 16 px (érintőn 22 px), bejelölve `bg-primary`, a pipa
  `text-primary-foreground`. Mindig `Label` mellette, 8 px réssel, vagy
  `aria-label`.
- Szegmens (2–5 lehetőség: szűrők, téma): `ToggleGroup type="single"`, egy
  közös 1 px `border-input` keretben, az elemek között függőleges elválasztó,
  elem `px-3.5 py-1.5` 13 px. Kijelölt: `bg-muted text-foreground font-semibold`.
  Nem kitöltött kiemelő színű.
- Kapcsoló (`Switch`): csak azonnal érvényes beállításra (pl. „Összecsukott
  oldalsáv”). Bekapcsolva `bg-primary`.

### 5.4 Kártya

- `bg-card border border-border rounded-lg shadow-sm`, `min-w-0`.
- Fejléc: `px-4 py-3 border-b`, benne `h2` 14 px 600, mellette opcionálisan
  12 px `muted-foreground` alcím, jobbra a kártya műveletei (`link` gomb,
  szegmens, kereső).
- Törzs: `p-4`. Ha a kártya csak egy táblázatot tartalmaz, a törzs margó nélküli,
  és a táblázat ér a kártya széléig.
- Kártyán belül nincs színes fejléc, nincs színes bal csík, nincs ikon a cím előtt.

### 5.5 Stat-kártya (összesítő szám)

- `Card` `px-4 py-3.5`: felül címke 12 px `muted-foreground`, alatta érték 24 px
  600 `tabular-nums`, alatta 12 px `faint` magyarázat („3 napon belül vagy lejárt”).
- Asztalin 4 egy sorban, tableten és mobilon 2 × 2.
- A szám nem színes, nincs mellette nyíl vagy trendgrafikon, hacsak a ticket nem kéri.
- A blokk `section aria-labelledby`, `sr-only` `h2`-vel („Napi összesítő”).

### 5.6 Táblázat (`ResponsiveTable`)

- Teljes szélesség, `border-collapse`, 13 px.
- Fejléc: `bg-muted`, 12 px 600 `muted-foreground`, `px-3 py-2`, alsó szegély,
  nem nagybetűs. `th scope="col"`.
- Cella: `px-3 py-2.5`, alsó 1 px `border-border` (az utolsó soron nincs).
- Számok jobbra, `tabular-nums`. Idő, kártyaszám: monospace 12 px `muted-foreground`.
- Név cella: 28 px kör avatar (monogram) + név, 10 px réssel.
- Kattintható sor: `cursor-pointer`, hover `bg-muted`, kijelölt `bg-primary/10`,
  fókusz 2 px belső gyűrű, `tabIndex={0}`, Enter és szóköz nyitja.
- Soron belüli művelet: `link` gomb a jobb szélen, egyedi `aria-label`-lel
  („Nagy Eszter kiléptetése”).
- Üres állapot: egy sor, középre igazított 13 px `muted-foreground` szöveg,
  28 px függőleges margóval („Még nincs belépés ma.”). Nincs illusztráció.
- Mobilon kártyasor: soronként egy blokk, `címke: érték` párok, a címke 12 px 600
  `muted-foreground` balra, az érték jobbra (9. fejezet).
- Rejtett `caption` minden táblán, a sorfejléc `th scope="row"`.

### 5.7 Jelvény (`Badge`)

- 12 px 500, `px-2 py-0.5`, `rounded-sm`, 1 px keret, előtte 6 px-es kör pötty a
  szöveg színében.
- Csak ezek a variánsok:

| Variáns | Szín | Szöveg (példák) |
| --- | --- | --- |
| `success` | `text-success bg-success/10 border-success/30` | Érvényes, Aktív, Bent van |
| `warning` | `text-warning bg-warning/10 border-warning/30` | Hamarosan lejár, Telt ház |
| `destructive` | `text-destructive bg-destructive/10 border-destructive/30` | Lejárt, Nincs alkalom, Elutasítva |
| `secondary` | `text-muted-foreground bg-muted border-border` | Távozott, Letiltva, Kiegészítő, Te |

- A `secondary` „címke” jellegű jelvénynél (Kiegészítő, Te, Csak admin) nincs pötty.
- Állapot soha nem csak szín: mindig van szöveg.

### 5.8 Figyelmeztetés (`Alert`)

- `rounded-md border px-3 py-2.5 text-sm`, ikon nélkül vagy 16 px ikonnal.
- Hiba / érvénytelen bérlet: `destructive` halvány változat, `role="alert"`.
- Infó (pl. „Érvényes bérletnél az új időszak a mostani lejárat után indul.”):
  `bg-primary/10 border-primary/35 text-foreground`.

### 5.9 Adatlista (vendég adatlap)

- `dl` kétoszlopos rács: 130 px (mobil 110 px) címke + érték.
- Címke `dt` 13 px `muted-foreground`, érték `dd` 13 px 500, soronként alsó
  1 px szegély, `py-1.5`.
- Kiegészítő info az értéken belül zárójelben, `muted-foreground`
  („nov. 29. (még 19 nap)”).

### 5.10 Haladásjelző

- 6 px magas, `bg-muted border rounded-sm`, kitöltés `bg-primary`.
- Hamarosan lejár: `bg-warning`; lejárt/elfogyott vagy telt ház: `bg-destructive`
  vagy `bg-warning`.
- `aria-label` és `aria-valuenow`/`aria-valuemax`, vagy `aria-hidden`, ha a szám
  mellette szövegben ott van.

### 5.11 Avatar

- Monogram (vezetéknév + keresztnév első betűje), kör, `bg-muted border text-muted-foreground`
  600. Méretek: 28 px (tábla), 32 px (oldalsáv), 44 px (adatlap, 15 px betű).
- Nem színes, nem véletlenszerű háttérszín. `aria-hidden`, a név mellette szövegben van.

### 5.12 Modál (`Dialog`, `AlertDialog`)

- Szélesség 640 px (űrlap: 480 px), `max-h-[84vh]`, `rounded-lg border shadow-lg`,
  felülről 8vh-ra (nem függőlegesen középen).
- Fejléc: `px-[18px] py-3.5 border-b`, `DialogTitle` = `h2` 15 px 600. Bezárás gomb
  (`X`) jobbra, `aria-label="Bezárás"`.
- Törzs: `p-[18px]`, görgethető. Alblokkok `h3` 12 px 600 `muted-foreground`.
- Lábléc: `px-[18px] py-3 border-t`, balra az összeg vagy összefoglaló (12 px
  `muted-foreground`, felette 18 px 600 érték, `aria-live="polite"`), jobbra
  `secondary` „Mégse” és `primary` megerősítő.
- Választás listából (termék, óra): rádiós táblázat vagy `RadioGroup`, a teljes
  sor kattintható, de a mentés csak a `primary` gombbal történik.
- Mobilon teljes képernyő, `rounded-none`, a lábléc gombjai teljes szélességűek.
- A Radix fókuszkezelését ne írd felül. A vonalkódolvasó működjön nyitott modál
  mellett is (10. fejezet).

### 5.13 Toast (Sonner, `shared/lib/notify`)

- Jobb alul (mobilon alul, teljes szélességben), 64 px-re az aljától.
- Háttér `bg-foreground`, szöveg `text-background`, 13 px, `rounded-md`, `px-3.5 py-2.5`.
- Szöveg: mi történt, kivel. „Nagy Eszter beléptetve, szekrény: 23.”
  „Havi korlátlan rögzítve, 64 900 Ft, bankkártya.”
- Akciógomb a toastban (Sztornó, Visszavonás): `link` stílusú.
- 2.8–4 másodperc, hibánál amíg be nem zárják.

### 5.14 Tooltip, legördülő menü

- Tooltip: `bg-foreground text-background text-xs px-2 py-1 rounded-md`, 300 ms
  késleltetés. Csak kiegészítő info, ami máshol is elérhető.
- `DropdownMenu`: `bg-popover border shadow-lg rounded-md p-1`, elemek 32 px,
  13 px, ikon 16 px, hover `bg-muted`.

### 5.15 Betöltés, üres és hibaállapot

- Betöltés: `Skeleton` (`bg-muted rounded-md animate-pulse`) a tartalom alakjában
  (táblasorok, stat-kártyák).
- Üres: egy mondat, mit lehet tenni („Még nincs vendég. Vegyél fel egyet az Új
  vendég gombbal.”), illusztráció nélkül.
- Hiba: `Alert` hiba variáns a kártyán belül + `secondary` „Újrapróbálás” gomb.

## 6. Oldalak

Minden oldal: `PageHeader` (`h1`) → blokkok (`h2`) → alblokkok (`h3`). A rácsok
mindig `minmax(0, …)` oszlopokkal, a gyerekeken `min-w-0`.

### 6.1 Recepció (`/reception`)

- **PageHeader:** „Recepció” / „Beléptetés, bérletek és mai foglalások egy helyen.”
  Műveletek: `secondary` „Kártya olvasása” (csak a `/demo`-n szimuláció), `primary`
  „Új vendég” (`Plus`).
- **Napi összesítő** (4 stat-kártya): Bent tartózkodik · Mai belépések
  („ebből N kártyával”) · Elutasított belépés („lejárt vagy elfogyott bérlet”) ·
  Lejáró bérletek („3 napon belül vagy lejárt”).
- **Rács:** asztalin `grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-4`, alatta
  egy oszlop.
  - Bal oszlop:
    1. „Mai belépések” kártya. Fejlécben kereső („Név, kártyaszám vagy telefon”);
       ha van keresőszöveg, a cím „Keresési találatok”. Oszlopok: Idő (`14:52–15:40`
       monospace) · Vendég · Óra (`16:30 Reformer Alap`) · Mód (Kártya / Kézi) ·
       Állapot (Bent van / Távozott / Elutasítva) · művelet (`link` „Kiléptetés”).
       A legújabb felül.
    2. „Mai órák” kártya. Fejlécben `link` „Teljes órarend”. Oszlopok: Idő · Óra ·
       Terem · Edző · Foglalt (`7 / 8`, teltnél `warning` „Telt ház”).
  - Jobb oszlop:
    1. „Vendég adatai” kártya, fejlécben a bérlet jelvénye. Avatar 44 px + név
       16 px 600 + „RS-04821 · +36 30 412 8831” monospace 12 px. Érvénytelen
       bérletnél `Alert` hiba: „A bérlet nov. 7. napon lejárt. Beléptetés előtt
       hosszabbítás vagy új bérlet szükséges.” Adatlista: Bérlet · Érvényes ·
       Fennmaradó (+ haladásjelző) · Mai foglalás · Szekrény · Vendég óta.
       Gombsor: `primary` „Beléptetés” (bent lévőnél `secondary` „Kiléptetés”) ·
       `secondary` „Hosszabbítás” (érvénytelen bérletnél ez lesz a `primary`, a
       Beléptetés letiltva) · `secondary` „Új vásárlás”. Alatta külön sorban
       `link` „Foglalás módosítása” · `link` „Előzmények”.
    2. „Vendégmonitor” kártya, alcím „élő előnézet”, fejlécben `link` „Teljes nézet”:
       a monitor kicsinyített képe.
- A `useBarcodeScanner` beolvasása a kiválasztott vendéget állítja be, és a
  listába új sort tesz. Az új sor nem villog, nem animálódik.

### 6.2 Vendégmonitor (`/monitor`)

- Nem kap keretet, nem követi a témát és a felületszínt (`.monitor-invariant`,
  a `theme-support.mdc` szerint fix sötét/smaragd dizájn).
- **Alapképernyő:** bal felül „REFORM STUDIO”, jobb felül óra (nagy, vékony,
  `tabular-nums`). Középen: „Érintsd a kártyádat vagy a telefonodat az olvasóhoz”,
  alatta egy sor, hol az olvasó. Alul a következő 3 óra: idő + név, alatta a terem.
- **Sikeres belépés (6 mp):** „Üdv újra” felirat, alatta a keresztnév nagyon
  nagy betűvel; egy sávban a mai óra ideje, neve, terme, edzője; alul három adat:
  Szekrény · Bérlet (pl. „4 / 8 alkalom”) · Érvényes. Alul vékony sáv jelzi a
  6 mp-et.
- **Sikertelen belépés:** „A belépés nem sikerült”, keresztnév, az ok („Lejárt
  bérlet”), „Kérjük, fordulj a recepcióhoz.” Piros jelzés, de nem villogó.
- Méretek a kijelzőhöz skálázva (`clamp()`), 16:9 arányban. Teljes név,
  telefonszám, ár soha.
- A monitor szövegei nem címsorok. Az üzenetváltás nem élő régió (a recepciós
  toast jelzi).

### 6.3 Órarend (`/schedule`)

- PageHeader: „Órarend” / „nov. 10., 7 óra, 48 foglalás”. Művelet: `primary`
  „Új óra” (`schedule` jog).
- Egy kártya, benne táblázat: Idő · Óra (600) · Terem · Edző · Telítettség
  (haladásjelző, 28% széles oszlop) · Foglalt (`6 / 8`).
- Telt ház: a haladásjelző `warning`.

### 6.4 Vendégek (`/guests`)

- PageHeader: „Vendégek” / „N regisztrált vendég. Egy sorra kattintva a
  recepción nyílik meg.” Művelet: `primary` „Új vendég” (`members` jog).
- Kártya fejlécében szegmens: Mind · Érvényes · Hamarosan lejár · Lejárt /
  elfogyott, mellette „N találat” (`aria-live`).
- Táblázat: Kártya · Név · Telefon · Bérlet · Fennmaradó · Lejárat · Állapot.
- A meglévő funkciók (digitális kártya, fagyasztás, `+N` nap) a vendég
  részletein `secondary` gombként vagy `DropdownMenu`-ben maradnak.

### 6.5 Bérletek és termékek (`/passes`)

- PageHeader: „Bérletek és termékek” / jogtól függően „Az árak közvetlenül a
  táblázatban módosíthatók.” vagy „Az árak módosításához admin jogosultság kell.”
  Művelet: `primary` „Új termék” (`prices` jog).
- Táblázat: Megnevezés (600, kiegészítőnél `secondary` „Kiegészítő” jelvény) ·
  Leírás · Érvényesség (`45 nap`) · Alkalom (`8` vagy „Korlátlan”) · Ár
  (`52 000 Ft`; jog esetén 110 px-es mező `aria-label="… ára forintban"`) ·
  Eladva (30 nap).
- Pénzösszeg mindig szóközzel tagolva, „Ft” utótaggal: `toLocaleString('hu-HU')`.

### 6.6 Vásárlás és hosszabbítás (modál)

- Cím: „Vásárlás · Nagy Eszter” / „Bérlet hosszabbítása · Nagy Eszter”.
- Hosszabbításnál felül infó: „Jelenleg: 8 alkalmas Reformer, nov. 29-ig
  érvényes. Érvényes bérletnél az új időszak a mostani lejárat után indul.”
- Rádiós táblázat: választás · Termék · Leírás · Ár. Hosszabbításnál csak a
  bérletek (nincs napijegy és kiegészítő).
- Alatta két mező: Fizetési mód (`Select`: Bankkártya, Készpénz, SZÉP-kártya,
  Átutalás) · Megjegyzés a számlára (nem kötelező).
- Lábléc: összeg + „Új lejárat: dec. 24.” · `secondary` „Mégse” · `primary`
  „Fizetés rögzítése”.

### 6.7 Felhasználókezelés (`/admin/users`, `users` jog)

- PageHeader: „Felhasználókezelés” / „A stúdió munkatársai és a szerepkörük. A
  szerepkör határozza meg, mit érhetnek el.” Műveletek: `secondary`
  „Jogosultságok” (→ Szerepkörök) · `primary` „Új felhasználó”.
- Táblázat: Név (avatar + név, saját sornál `secondary` „Te” jelvény) · E-mail ·
  Szerepkör (soron belüli `Select`, 150 px, `aria-label="… szerepköre"`; saját
  sornál letiltva) · Állapot (Aktív / Letiltva) · Utolsó belépés · Művelet
  (`link` „Letiltás” / „Aktiválás”, letiltásnál `AlertDialog`).
- „Új felhasználó” modál: Név* · E-mail* · Szerepkör. Mentés után meghívó megy,
  a sor „Meghívó elküldve” utolsó belépéssel jelenik meg.

### 6.8 Szerepkörök és jogok (`/admin/roles`, `roles` jog)

- PageHeader: „Szerepkörök és jogok” / „Pipáld be, melyik szerepkör mit
  csinálhat. A változás azonnal érvényes.” Művelet: `primary` „Új szerepkör”.
- Kártya „Jogosultságok szerepkörönként”: mátrix. Sorok a jogok (`th scope="row"`,
  13 px 400), oszlopok a szerepkörök (név + „N fő” 12 px), cellákban középre
  igazított `Checkbox` (`aria-label="Recepciós: Bérlet hosszabbítása"`).
- Az Admin oszlop minden pipája bejelölt és letiltott („Az admin jogai nem
  vehetők el.”).
- A jogok (kulcs → felirat):
  `checkin` Kézi beléptetés és kiléptetés · `book` Órára foglalás vendég nevében ·
  `sell` Bérlet és termék értékesítése · `extend` Bérlet hosszabbítása ·
  `members` Vendégadatok szerkesztése · `prices` Árak és termékek módosítása ·
  `schedule` Órarend szerkesztése · `users` Felhasználók kezelése ·
  `roles` Szerepkörök és jogok kezelése.
- Alapszerepkörök: **Admin** (minden), **Recepciós** (checkin, book, sell,
  extend, members), **Edző** (book).
- Alatta szerepkörönként egy kis kártya: név (`h3`) + egy mondatos leírás.
- Pipa változásakor toast: „Recepciós: bérlet hosszabbítása tiltva”.

### 6.9 Beállítások (`/settings`)

A fiókpanelből nyílik (4.2), a menüben nincs.

- PageHeader: „Beállítások” / „A megjelenés ezen a gépen mentődik.”
- Kártya „Megjelenés”, soronként kétoszlopos beállítássor (220 px leírás +
  vezérlő, a sorok között 1 px elválasztó, `py-4`; mobilon egymás alatt). Minden
  változás azonnal érvényes és mentődik; a téma és a felületszín váltásakor
  nincs toast (a változás azonnal látszik).
  - **Téma** (`h3`) „Világos vagy sötét felület” → szegmens (`ToggleGroup`):
    Világos (`Sun`) · Sötét (`Moon`). Ugyanez a fiókpanel Téma kapcsolója.
  - **Felületszín** „Elsődleges gombok, aktív menüpont, jelölők” → 6 színminta
    (3.4; 30 × 30 px, érintőn 40 px, `rounded-md`, `border-border`; minden minta a
    saját `data-surface`-ével a saját palettáját mutatja, sötét témában a világos
    árnyalatot; kijelölt: 2 px `outline-foreground` 2 px eltolással és `Check`
    ikon; `aria-label` a névvel), mellette a kiválasztott szín neve 13 px
    `muted-foreground`. Egyedi színválasztó nincs.
  - **Oldalsáv** „Csak ikonok, több hely a tartalomnak. Keskeny és széles
    képernyőn külön mentődik.” → `Switch` „Összecsukott oldalsáv” (az aktuális
    sáv beállítása, ugyanaz, mint az összecsukó gomb). Mobilon (768 px alatt)
    rejtve, mert ott kihúzható menü van, nincs ikonsáv.
- Kártya „Stúdió adatai” (későbbi jegy, még nincs hozzá API): nem adminnál
  fejlécben `secondary` „Csak admin” jelvény `Lock` ikonnal, a mezők letiltva;
  Stúdió neve · Cím · Vendégmonitor kijelzési idő (4 / 6 / 10 mp) · Lejárat előtti
  figyelmeztetés (1 / 3 / 7 nap), két oszlopban. Alul `primary` „Mentés” · `link`
  „Mégse”.

## 7. Állapotok és szövegek

### 7.1 Bérletállapot

| Feltétel | Jelvény | Beléptetés |
| --- | --- | --- |
| Érvényes, több mint 3 nap és több mint 1 alkalom | `success` „Érvényes” | engedélyezett |
| ≤ 3 nap vagy ≤ 1 alkalom | `warning` „Hamarosan lejár” | engedélyezett |
| Lejárt | `destructive` „Lejárt” | tiltott, a Hosszabbítás a fő gomb |
| 0 alkalom | `destructive` „Nincs alkalom” | tiltott |

A 3 nap az admin beállítása („Lejárat előtti figyelmeztetés”).

### 7.2 Szövegszabályok

- Magyar, tegező a vendégnek (monitor), semleges a munkatársnak („Beléptetés
  előtt hosszabbítás szükséges.”).
- Dátum: `nov. 10.`, `nov. 10., kedd`. Idő: `14:52`. Pénz: `52 000 Ft`.
- Gomb és menüpont: főnév vagy ige, nagy kezdőbetűvel, pont nélkül.
- Hibaüzenet: mi a gond és mit lehet tenni. „A(z) „Teljes név” mező kitöltése
  kötelező.” Nem „Hiba történt!”.
- Nincs felkiáltójel, nincs emoji, nincs „Hoppá”.
- Jog hiányánál: „Ehhez a menüponthoz admin jogosultság kell”, „Nincs
  jogosultságod ehhez”.

## 8. Akadálymentesség (kötelező)

- Landmarkok: `header`, `nav aria-label="Főmenü"`, `main id="main" tabIndex={-1}`,
  egyszer-egyszer. Morzsamenü `nav aria-label="Morzsamenü"`. Oldalsáv alja
  `section aria-label="Bejelentkezett felhasználó"`.
- Első fókuszálható elem: „Ugrás a tartalomra” (`sr-only focus:not-sr-only`,
  `href="#main"`, kiemelő színű doboz bal felül).
- Címsorok: oldalanként egy `h1`; blokkok `h2`; alblokkok `h3`; ugrás nincs.
  Látható cím nélküli blokk `sr-only` `h2`-t kap. Modál címe `h2`.
- `document.title`: „{Oldal neve} · ReformStudio Sync”.
- Minden ikon gomb, jelölőnégyzet, színminta, soron belüli gomb egyedi nevet kap.
- Állapotjelzők: `aria-current="page"` (aktív menü), `aria-expanded`
  (összecsukó, fiókpanel), `aria-pressed` (fejléc téma gombja), `aria-checked`
  (Téma kapcsoló; a szegmens és a színminták `ToggleGroup`-ként), `aria-disabled`
  (jog nélküli menü).
- Billentyűzet: minden művelet elérhető. Kattintható sor Enterre és szóközre nyílik.
  Oldalváltáskor a fókusz a `main`-re kerül. Újrarajzolás után a fókusz a helyén
  marad vagy a párjára kerül (Beléptetés → Kiléptetés).
- Fókusz mindig látszik: 2 px `ring-ring`, 2 px eltolással.
- Élő régiók: toastok (`polite`), érvénytelen bérlet `role="alert"`, szűrő
  találatszáma és modál összege `aria-live="polite"`. Óra és monitor nem.
- Kontraszt: szöveg legalább 4.5:1, nagy szöveg és ikon 3:1. Halványabb szürke a
  3.1–3.2 táblázatnál nem vezethető be.
- `prefers-reduced-motion`: nincs animáció.
- Részletek és ellenőrzőlista: `references/accessibility.md`.

## 9. Reszponzív viselkedés (kötelező)

| Nézet | Szélesség | Oldalsáv | Tartalom |
| --- | --- | --- | --- |
| Mobil | < 768 px | rejtve, a fejléc ☰ gombja kihúzza | egy oszlop, táblázat helyett kártyasor, teljes képernyős modál |
| Tablet | 768–1279 px | ikonsáv alapból, kinyitható | egy oszlop, stat-kártyák 2 × 2 |
| Asztali | ≥ 1280 px | teljes, összecsukható | két oszlop a recepción, 4 stat-kártya |
| Széles, 21:9 | ≥ 1448 px | mint asztalin | **max. 1400 px, középre igazítva** |

- A tartalom és a fejléc belseje: `mx-auto max-w-[1400px]`. Az oldalsáv mindig a
  bal szélen, a fejléc háttere teljes szélességű.
- Mobilon: a fejlécben csak ☰ + oldalnév + téma gomb; a `PageHeader` gombjai a
  cím alatt, teljes szélességben; a kereső teljes szélességű; a szegmensek
  tördelődnek; a toast alul teljes szélességű; nincs vízszintes görgetés.
- Mobil menü: Escape, háttérre koppintás vagy menüpont választása zárja; nyitva a
  háttér `inert`; zárás után a fókusz a ☰ gombra kerül. `Ctrl+B` mobilon a menüt
  nyitja-zárja, asztalin az oldalsávot csukja-nyitja.
- Érintőn (`pointer: coarse`): gomb, mező, menüpont legalább 44 px, mezőben 16 px
  betű, jelölőnégyzet 22 px, színminta 40 px.
- Részletek: `references/responsive.md`.

## 10. Munkamenet

### 10.1 Első lépés: shadcn/ui és tokenek

Ha a `src/shared/ui` még nem shadcn-alapú, előbb `references/setup.md`:
`shadcn@2.3.0` (Tailwind 3 miatt), `components.json` az FSD `shared` rétegre,
`darkMode: ['selector', '.reception-theme-dark']`, tokenek a `tokens.md`-ből,
a `Button` és a `Badge` átírása a fenti variánsokra.

### 10.2 Új oldal vagy komponens

1. Keresd meg a 6. fejezetben az oldalt. Ha nincs ott, a legközelebbi minta
   szerint építsd (lista oldal → 6.4, beállítás oldal → 6.9).
2. Csak `@/shared/ui` komponensek, csak tokenszínek, csak a három gomb.
3. Szövegek a 7. fejezet szerint.
4. Ellenőrzés: 10.4.

### 10.3 Régi oldal átállítása

Oldalanként, ebben a sorrendben: alkalmazáskeret (oldalsáv, fejléc,
`PageContainer`) → `/reception` → `/guests` → többi. Az új admin oldalak eleve
így készülnek. Oldalanként: nyers elem → shadcn komponens, nyers szín → token,
gomb → a három variáns egyike. A működést (mutációk, socket, offline puffer,
mock-motor, szkenner) ne írd át. Ha egy régi gomb egyik variánsba sem illik,
kérdezd meg a felhasználót, ne találj ki negyediket.

### 10.4 Ellenőrzés jelentés előtt

- `bash .claude/skills/reform-ticket/scripts/gate.sh` zöld.
- Tiltott minták az érintett fájlokban (új találat ne legyen):
  ```
  rg -n "<button" apps/web/src --glob '!apps/web/src/shared/ui/**'
  rg -n "variant=\"(destructive|ghost|outline|default)\"" apps/web/src
  rg -n "(bg|text|border)-(white|black|slate|gray|zinc|neutral|emerald|green|rose|red|amber|yellow)-?[0-9]*\b" apps/web/src --glob '!**/monitor/**'
  rg -n "rounded-(xl|2xl|3xl)|bg-gradient|backdrop-blur" apps/web/src
  rg -n "rounded-\[14px\]" apps/web/src   # csak az oldalsáv kártyája
  ```
- Az app futott (`run` skill vagy `npm run dev:web`), és megnézted világos és
  sötét témában, 375, 1024, 1440 és 2560 px szélességen.
- Billentyűzettel végigmentél az oldalon, és nyitott modál mellett kipróbáltad a
  vonalkódolvasót a `/reception` és a `/demo` oldalon.
- Az `references/accessibility.md` ellenőrzőlistája végigment.
- Felhasználó számára látható változásnál bejegyzés a
  `apps/web/src/entities/release-note/model/releaseNotes.ts`-ben (`jiraKey` kötelező).

## 11. Beszámoló

Röviden, magyarul: mely oldalak és komponensek változtak, mi került a
`shared/ui`-ba, a gate eredménye, mit néztél meg (témák, szélességek,
billentyűzet, szkenner), mit nem, és miért. Ha ettől a specifikációtól el kellett
térned, írd le, hol és miért.
