# Akadálymentesség

Cél: a WCAG 2.2 AA alapkövetelményei. A Radix primitívek (shadcn) sokat megoldanak
(fókuszcsapda, ARIA szerepek, billentyűzet a Selectben és a menükben), de a
szerkezet, a nevek és a címsorok a mi dolgunk.

## Szerkezet

- **Landmarkok**, oldalanként pontosan egy-egy:
  - `header`: a felső sáv;
  - `nav aria-label="Főmenü"`: az oldalsáv;
  - `main id="main" tabIndex={-1}`: a tartalom.
- A morzsamenü `nav aria-label="Morzsamenü"`, az aktuális elemen `aria-current="page"`.
- Az oldalsáv alja (bejelentkezett munkatárs): `section aria-label="Bejelentkezett felhasználó"`.
- **„Ugrás a tartalomra” link** a `body` első elemeként, `sr-only focus:not-sr-only`,
  `href="#main"`.
- **Címsorok:** oldalanként egy `h1` (a `PageHeader`). A blokkok (`Card`) `h2`, az
  alblokkok `h3`. Szint nem ugorható át. Ha egy blokknak nincs látható címe (pl.
  az összesítő számok), kapjon `sr-only` `h2`-t, és a blokk legyen
  `section aria-labelledby`.
- A modál címe `h2` (`DialogTitle`), a benne lévő alblokkok `h3`.
- A Vendégmonitor kijelzőszövegei nem címsorok.
- `document.title` oldalváltáskor: `„{Oldal neve} · ReformStudio Sync”`.

## Nevek és állapotok

- Minden ikon gombnak `aria-label` kell. Minden ikon `aria-hidden`.
- Összecsukó gomb: `aria-expanded`, `aria-controls`. A téma gomb: `aria-pressed`.
- Összecsukott oldalsávnál a menüpont neve `aria-label` vagy a látható szöveg
  `sr-only`, nem csak tooltip.
- Ismétlődő gombok a táblázatban egyedi nevet kapnak: `aria-label="Nagy Eszter kiléptetése"`.
- Jogosultsági mátrix: minden `Checkbox` `aria-label="{Szerepkör}: {Jogosultság}"`.
  A sor első cellája `th scope="row"`.
- Színminták (felületszín): `aria-label` a szín nevével, `aria-pressed` vagy
  `ToggleGroup`-elem `data-state`.
- Haladásjelző: `role="progressbar"` (a shadcn `Progress` adja), plusz `aria-label`.
  Ha mellette szövegben is ott a szám, a sáv lehet `aria-hidden`.

## Billentyűzet és fókusz

- Minden művelet elérhető billentyűzettel. Kattintható táblázatsor: `tabIndex={0}`,
  Enter és szóköz nyitja meg.
- Látható fókusz mindenhol: `focus-visible:ring-2 ring-ring ring-offset-2`. A
  `outline: none` csak akkor, ha helyette van gyűrű.
- Oldalváltáskor a fókusz a `main`-re kerül. Egy művelet után, amely újrarajzolja
  a nézetet (beléptetés, mentés), a fókusz a párjára kerül (Beléptetés → Kiléptetés)
  vagy marad a helyén. Ne essen vissza a `body`-ra.
- Modál: a Radix kezeli (fókuszcsapda, Escape, visszaadás). Megnyitáskor a fókusz
  az első mezőre vagy a kiválasztott rádiógombra kerül, ne a bezárás gombra.
- Mobil menü (`Sheet`): Escape zárja, a háttér `inert`, bezáráskor a fókusz
  visszakerül a menü gombra (a shadcn `Sidebar` ezt adja).
- A `useBarcodeScanner` billentyűfigyelése mindezek mellett is működjön.

## Élő régiók

- A Sonner toastjai élő régióban vannak (`aria-live="polite"`), a beléptetés és a
  mentés visszajelzését a képernyőolvasó felolvassa.
- Lejárt bérlet figyelmeztetése a vendég adatlapján: `role="alert"`.
- Szűrő találatszáma, modál összege: `aria-live="polite"`.
- Ne tegyél élő régióba gyakran frissülő tartalmat (óra, monitor-előnézet).

## Szín és mozgás

- Szövegkontraszt legalább 4.5:1, nagy szövegnél és ikonnál 3:1. A
  `muted-foreground` értékei ezt tudják (`tokens.md`); halványabb szürkét ne vezess be.
- Állapot soha nem csak szín: a jelvényben mindig szöveg is van.
- `prefers-reduced-motion: reduce` esetén nincs animáció és átmenet
  (`motion-reduce:transition-none`, a `tailwindcss-animate` animációinál
  `motion-reduce:animate-none`).

## Űrlapok

Lásd `components.md` Űrlapok pontját: látható felirat, kötelező mező jelölése,
hibaüzenet a mező alatt `aria-describedby`-vel, fókusz az első hibára, Enterre
beküldés.

## Ellenőrzőlista (jelentés előtt, minden érintett oldalra)

- [ ] Egy `h1`, a címsorszintek sorrendben (böngésző: Accessibility fa vagy a
      HeadingsMap bővítmény).
- [ ] `header`, `nav`, `main` egyszer-egyszer; „Ugrás a tartalomra” működik.
- [ ] Csak Tab/Shift+Tab/Enter/szóköz/Escape/nyilak használatával az oldal minden
      művelete elvégezhető, a fókusz mindig látszik.
- [ ] Modál nyitás és zárás után a fókusz a helyére kerül.
- [ ] Ikon gomboknak, jelölőnégyzeteknek, mezőknek van neve (axe: „button-name”,
      „label” szabály).
- [ ] Világos és sötét témában a szöveg olvasható (axe: „color-contrast”).
- [ ] Ha van `@axe-core/playwright`, futtasd az érintett oldalra; ha nincs, és
      a ticket UI-t érint, javasold a felvételét az `e2e/`-be.
