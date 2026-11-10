# Reszponzív viselkedés

## Töréspontok

| Nézet | Szélesség | Oldalsáv | Tartalom |
| --- | --- | --- | --- |
| Mobil | < 768 px (`md` alatt) | rejtve, a fejléc menü gombja kihúzza (`Sheet`) | egy oszlop, táblázat helyett kártyasor, teljes képernyős modál |
| Tablet | 768–1279 px (`md`–`lg`) | ikonsáv (`collapsible="icon"`, alapból összecsukva), kinyitható | egy oszlop, stat-kártyák 2×2 |
| Asztali | ≥ 1280 px (`xl`) | teljes, feliratos, összecsukható | két oszlop a recepción, 4 stat-kártya |
| Széles (21:9 is) | ≥ 1448 px | mint asztalin | a tartalom **max. 1400 px, középre igazítva** |

A shadcn `Sidebar` mobil-töréspontja a `use-mobile` hookban van: legyen 768 px.
A tablet-kezdőállapotot (összecsukva) a `SidebarProvider` `defaultOpen`-je adja,
egy `matchMedia('(max-width: 1279px)')` alapján. Ha a felhasználó kézzel
kinyitja, az ő választása marad érvényben (a shadcn cookie-ban tárolja).

## A 1400 px-es tartalom

- `PageContainer`: `mx-auto w-full max-w-content px-4 md:px-6`
  (`maxWidth.content = 1400px` a Tailwind configban). Így a blokkok legfeljebb
  1400 px szélesek, és széles monitoron középen vannak, két oldalt a háttérrel.
- A fejléc belseje ugyanebben a `max-w-content mx-auto` szélességben van, hogy a
  morzsamenü egy vonalban legyen a tartalommal. A fejléc háttere és alsó
  szegélye a teljes szélességen fut.
- Az oldalsáv mindig a bal szélen marad, nem kerül be a középre igazított részbe.
- Rácsoknál mindig `minmax(0,1fr)` (`grid-cols-[minmax(0,3fr)_minmax(0,2fr)]`),
  és a flex/grid gyerekeken `min-w-0`, különben egy széles táblázat kitolja az
  oldalt.

## Mobil szabályok

- **Fejléc:** menü gomb (`SidebarTrigger`, `aria-label="Menü megnyitása"`), az
  aktuális oldal neve, téma gomb. A dátum és az óra rejtve.
- **PageHeader:** a cím alatt a műveletek, teljes szélességben (`flex-col`,
  gombok `flex-1`).
- **Kártyák:** `p-4` helyett `p-3`/`p-4`, a kártya fejlécében a kereső teljes
  szélességű új sorba kerül.
- **Táblázatok:** `ResponsiveTable` kártyasor módban, `címke: érték` párokkal. Nem
  vízszintes görgetés.
- **Modálok:** teljes képernyő, a lábléc gombjai teljes szélességűek, az összeg
  fölöttük.
- **Szűrők (`ToggleGroup`):** tördelődnek, az elemek kitöltik a sort.
- **Toast:** alul, a képernyő szélességében (Sonner `position="bottom-center"`
  mobilon).
- **Vendégmonitor előnézet** a recepción: elfér, de a „Következő órák” közül csak
  kettő látszik.

## Érintőképernyő

`@media (pointer: coarse)` (Tailwind `coarse:` variáns, `components.md`):

- gombok és mezők legalább 44 px magasak, mezőkben 16 px-es betű (iOS ne zoomoljon);
- menüpontok `py-3`;
- jelölőnégyzet, rádiógomb 22 px.

## Ellenőrzés

Minden érintett oldalt nézz meg ezeken a szélességeken, világos és sötét
témában:

- **375 px:** mobil, nincs vízszintes görgetősáv, a menü kihúzható.
- **1024 px:** tablet, ikonsáv, egy oszlop.
- **1440 px:** asztali, két oszlop.
- **2560 × 1080 px (21:9):** a tartalom 1400 px, középen.

Playwrightban: `page.setViewportSize({ width: 375, height: 812 })`, és ellenőrizd,
hogy `document.documentElement.scrollWidth <= window.innerWidth`.
