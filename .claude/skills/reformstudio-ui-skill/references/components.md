# Komponensek

Minden komponens a `@/shared/ui`-ból jön. Ha valamire nincs komponens, előbb
nézd meg a shadcn listáját (https://v3.shadcn.com/docs/components), és azt
telepítsd. Saját primitívet csak akkor írj, ha a shadcn-ben nincs megfelelő.

## Melyiket mire

| Felületi elem | Komponens | Megjegyzés |
| --- | --- | --- |
| Gomb, ikon gomb | `Button` | csak `primary`, `secondary`, `link`; ikonhoz `size="icon"` + `aria-label` |
| Szövegmező, kereső | `Input` + `Label` | kereső: `type="search"`, `Label` `sr-only`-val |
| Legördülő | `Select` | rövid listára; hosszú, kereshető listára `Command` + `Popover` |
| Jelölőnégyzet | `Checkbox` + `Label` | jogosultságtáblában `aria-label="Recepciós: Bérlet hosszabbítása"` |
| Egy választás 2–5 lehetőségből | `ToggleGroup type="single"` vagy `RadioGroup` | szűrők, téma, felületszín minták; `aria-label` a csoporton |
| Be/ki kapcsoló beállítás | `Switch` + `Label` | csak azonnal érvényes beállításra |
| Lista adatokkal | `Table` (asztali) + kártyasor (mobil) | `ResponsiveTable`, lásd lent |
| Blokk | `Card`, `CardHeader`, `CardTitle` (`h2`), `CardContent` | a `CardTitle` legyen `h2` (`asChild` vagy átírás) |
| Állapot | `Badge` | `success` / `warning` / `destructive` / `secondary` variáns, mindig szöveggel |
| Figyelmeztetés a blokkban | `Alert` | lejárt bérlet, hiányzó jog; hibánál `role="alert"` |
| Űrlap, vásárlás, foglalás | `Dialog` (asztali), mobilon teljes képernyő | lásd lent |
| Visszafordíthatatlan művelet | `AlertDialog` | sztornó, letiltás, törlés |
| Oldalsáv elem (menüpont, fiókpanel sora, összecsukó gomb) | `SidebarItem` (`nav` / `panel` / `icon`) | csak a sötét oldalsáv kártyán; `asChild`-dal link |
| Mobil menü | `Sheet` (`widgets/app-shell` `MobileSidebar`) | ugyanaz a sötét kártya, mint asztalin |
| Tipp a letiltott gombhoz, ikonsávhoz | `Tooltip` | a tartalom ne legyen fontos info, ami máshol nincs |
| Fiókpanel (Beállítások, Téma, Kijelentkezés) | `SidebarAccount` (`widgets/app-shell`) | a munkatárs sora mögül felcsúszó panel, nem `DropdownMenu` |
| Morzsamenü | `Breadcrumb` | a fejlécben |
| Telítettség, hátralévő alkalom | `Progress` | `aria-label` + `aria-valuenow` / `aria-valuemax` |
| Betöltés | `Skeleton` | nem pörgő ikon a tartalom helyén |
| Visszajelzés | `shared/lib/notify` (Sonner) | nem `alert()` |

## Gomb: pontosan három variáns

`src/shared/ui/button.tsx` (a generált fájl átírva):

```tsx
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold transition-colors ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background ' +
    'disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Fő művelet: egy nézetrészben legfeljebb egy.
        primary: 'rounded-md bg-primary text-primary-foreground hover:bg-primary/90',
        // Minden más művelet.
        secondary: 'rounded-md border border-input bg-secondary text-secondary-foreground shadow-sm hover:bg-muted',
        // Navigáció, másodrangú művelet szövegben vagy táblázatsorban.
        // `primary-text`: sötét témában a felületszín világos árnyalata (tokens.md).
        link: 'h-auto p-0 text-primary-text underline underline-offset-4 decoration-1 hover:decoration-2',
      },
      size: {
        default: 'h-9 px-4 coarse:h-11',
        sm: 'h-8 px-3 text-xs coarse:h-11',
        icon: 'h-9 w-9 coarse:h-11 coarse:w-11',
      },
    },
    compoundVariants: [{ variant: 'link', className: 'h-auto px-0 coarse:min-h-11' }],
    defaultVariants: { variant: 'secondary', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : (type ?? 'button')}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';
export { buttonVariants };
```

- A `coarse:` variánst add hozzá a Tailwind confighoz:
  `plugins: [plugin(({ addVariant }) => addVariant('coarse', '@media (pointer: coarse)'))]`.
  Érintőképernyőn így 44 px a célterület.
- Az alapértelmezett variáns szándékosan a `secondary`: a `primary`-t mindig
  tudatosan kell kiírni.
- **Veszélyes művelet** (sztornó, letiltás): nincs piros gomb. A gomb
  `secondary`, és `AlertDialog` kér megerősítést; ott a megerősítő gomb `primary`,
  a felirata a műveletet mondja ki („Beléptetés sztornózása”), nem „OK”.
- Letiltott gombnál, ha jogosultság hiányzik, a `Tooltip` mondja meg az okot
  („Ehhez admin jogosultság kell”). Mivel a letiltott gomb nem kap fókuszt, a
  `Tooltip` triggere egy köré tett `span tabIndex={0}` legyen.

## Alkalmazáskeret

```
<AppShell newsCount version>            // widgets/app-shell
  <SkipLink />
  <AppSidebar />                         // asztali: fixed, lebegő sötét kártya, peek
  | <MobileSidebar />                    // 768 px alatt: Sheet, ugyanaz a tartalom
  <AppHeader />                          // <header>: mobilon menü gomb + Breadcrumb + dátum + téma gomb
  <div className="ml-[var(--sidebar-offset)]">
    <PageContainer asChild><main id="main" tabIndex={-1}>…</main></PageContainer>
  </div>
</AppShell>
```

A `--sidebar-offset` (a kártya szélessége + 2 × `--sidebar-inset`) tolja a
tartalmat és a fejléc belsejét; peek közben nem változik. A DOM-ban pontosan egy
`header`, egy fő `nav` és egy `main` van. Az állapot a `widgets/app-shell/model/
sidebarState.ts`-ben: `useSidebarState` (elrendezés + peek) és a publikus
`useSidebarCollapsed` (a Beállítások kapcsolója).

**Oldalsáv (`SidebarPanel`, asztalin és mobilon ugyanaz)**

- Fejrész: „RS” jel (ikonsáv) / „ReformStudio Sync” (nyitva), jobbra asztalin az
  összecsukó gomb (`SidebarItem variant="icon"`, `PanelLeft`, `aria-expanded`).
- `SidebarNavigation`: `nav aria-label="Főmenü"`, szakaszonként szakaszcím (ikonsávban
  1 px elválasztó) és `ul`; a menüpont `SidebarItem asChild variant="nav"` +
  `NavLink end` (az aktív `aria-current="page"`-et a `NavLink` adja). A
  Vendégmonitor `a` elem, külön ablakban nyílik. Alul az Újdonságok (számláló) és a
  Demó mód.
- `SidebarAccount`: `section aria-label="Bejelentkezett felhasználó"`, a munkatárs
  sora (`aria-expanded`, `aria-controls`) és a fiókpanel (Beállítások, Téma
  `role="switch"`, Kijelentkezés), alatta a verzió (link az Újdonságokra). Esc,
  kívüli kattintás, navigálás, csukódás zárja; billentyűzettel nyitva a fókusz a
  panel első elemére kerül.
- Nyers `<button>` itt sincs: minden kattintható elem `SidebarItem` (`shared/ui`).
- Ikonok: `lucide-react`, 18 px a menüben, 16 px a panelen, `strokeWidth={1.75}`,
  `aria-hidden`. Mozgás csak CSS-átmenettel (`SKILL.md` 3.9).

**Fejléc (`AppHeader`)**: `h-14 border-b bg-card`, a háttere a kártya alatt teljes
szélességű, a tartalma `pl-[var(--sidebar-offset)]`-tól, a `max-w-content`
szélességben. Bal oldalon mobilon a menü gomb (`Menu`, `aria-label="Menü
megnyitása"`), utána a `Breadcrumb` (ReformStudio Sync / oldal neve). Jobb oldalon
dátum és idő (mobilon rejtve), téma gomb (`Button variant="secondary"
size="icon"`, `aria-pressed`, `aria-label="Sötét mód"`, `saveTheme`).

## Oldal felépítése

```tsx
<PageHeader
  title="Recepció"                         // h1, oldalanként egy
  description="Beléptetés, bérletek és mai foglalások egy helyen."
  actions={<>
    <Button variant="secondary"><ScanLine aria-hidden /> Kártya olvasása</Button>
    <Button variant="primary"><Plus aria-hidden /> Új vendég</Button>
  </>}
/>
<section aria-labelledby="stats-h"><h2 id="stats-h" className="sr-only">Napi összesítő</h2>…</section>
<div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">…Card-ok…</div>
```

- `PageHeader`: `h1` 20 px félkövér, alatta `text-sm text-muted-foreground`. A
  műveletek jobbra, mobilon alá és teljes szélességre.
- Számkártyák (stat): `Card`, címke `text-xs text-muted-foreground`, érték
  `text-2xl font-semibold tabular-nums`. Asztalin 4, tableten és mobilon 2 oszlop.
- `Card`: `rounded-lg border bg-card shadow-sm`. Fejléc `px-4 py-3 border-b`,
  benne `h2` 14 px félkövér, jobbra a kártya műveletei (`link` gomb vagy szűrő).

## ResponsiveTable

A listák (belépések, vendégek, termékek, munkatársak, órák) egy közös
komponensen mennek, a `shared/ui`-ban:

```tsx
type Column<T> = { key: string; header: string; cell: (row: T) => React.ReactNode;
  srOnlyHeader?: boolean; align?: 'left' | 'right'; hideOnMobile?: boolean };

<ResponsiveTable
  caption="Mai belépések"                 // sr-only <caption>
  columns={columns}
  rows={rows}
  getRowId={(r) => r.id}
  onRowOpen={(r) => select(r.guestId)}    // kattintás + Enter/szóköz a soron
  emptyText="Még nincs belépés ma."
/>
```

- `md` felett `Table`: `thead`-ben `th scope="col"`, sorfejlécnél `th scope="row"`.
  A fejléc `bg-muted text-xs font-semibold text-muted-foreground`.
- `md` alatt ugyanaz az adat kártyasorként: soronként egy blokk, minden mező
  `címke: érték` párban (a címke a `header`). A `hideOnMobile` oszlop elmarad.
- Kattintható sor: `tabIndex={0}`, `onKeyDown` Enterre és szóközre, látható
  fókuszkeret. Ha a sorban van gomb, az a saját nevét kapja
  (`aria-label="Nagy Eszter kiléptetése"`), és a kattintása ne nyissa meg a sort.
- Számok jobbra igazítva, `tabular-nums`. Idő és kártyaszám `font-mono text-xs`.

## Modálok

- Cím: `DialogTitle`, ez `h2`. Az alblokkok `h3`.
- A Radix kezeli a fókuszcsapdát, az Escape-et és a fókusz visszaadását. Ezt ne
  írd felül.
- Lábléc: bal oldalt az összeg vagy az összefoglaló (`aria-live="polite"`, ha
  változik), jobbra `secondary` „Mégse” és `primary` megerősítő gomb.
- Választás listából (termék, óra): `RadioGroup`, soronként `Label`-lel. A
  választás önmagában nem ment; a mentés a `primary` gomb.
- Mobilon (`md` alatt) a `DialogContent` teljes képernyő: `inset-0 h-full max-w-none rounded-none`.
- **Szkenner:** nyitott modál mellett is működnie kell a `useBarcodeScanner`-nek.
  Ha a Radix `onKeyDown`-ja elnyeli, a szkenner figyelője a `window`-on,
  `capture: true`-val fusson, és a modál ne hívjon `stopPropagation`-t.

## Űrlapok

- Minden mezőnek látható `Label`-je van (`htmlFor` + `id`). A placeholder nem
  felirat.
- Kötelező mező: a felirat mellett `*` (`aria-hidden`), a mezőn `required` és
  `aria-required`, az űrlap alján „* kötelező mező”.
- Hiba: a mező alatt `text-destructive text-xs`, `id`-val, a mezőn
  `aria-invalid="true"` és `aria-describedby`. Beküldéskor a fókusz az első hibás
  mezőre ugrik.
- `type` és `autocomplete` a tartalomhoz: `email`, `tel`, `name`. Ár: `inputMode="numeric"`.
- Az űrlap `<form onSubmit>`, a mentés gomb `type="submit"`, így az Enter működik.

## Jelvények (Badge)

| Állapot | Variáns | Szöveg |
| --- | --- | --- |
| Érvényes bérlet, aktív munkatárs, bent van | `success` | „Érvényes”, „Aktív”, „Bent van” |
| Hamarosan lejár, telt ház | `warning` | „Hamarosan lejár”, „Telt ház” |
| Lejárt, nincs alkalom, elutasítva | `destructive` | „Lejárt”, „Nincs alkalom”, „Elutasítva” |
| Semleges | `secondary` | „Távozott”, „Letiltva”, „Kiegészítő” |

A `Badge` stílusa: halvány háttér (9%), a szín szövegben és keretben, előtte
6 px-es pötty. Nem telített, kitöltött címke. A generált `badge.tsx`-ben a
variánsok: `success`, `warning`, `destructive`, `secondary`, például
`success: 'border-success/30 bg-success/10 text-success'`. A `default` és az
`outline` variánst töröld.

## Vendégmonitor

A `/monitor` nem kapja meg az alkalmazáskeretet és a témát (`.monitor-invariant`).
A tartalmi szabályok: keresztnév, a mai foglalt óra (idő, terem, edző),
szekrényszám, hátralévő alkalom vagy nap, lejárat. Érvénytelen bérletnél: „A
belépés nem sikerült”, az ok, „Kérjük, fordulj a recepcióhoz”. Nincs teljes név,
telefonszám, ár. Az üzenet 6 másodperc után visszaáll az alapképernyőre
(óra + „Érintsd a kártyádat…” + következő órák). A monitor szövegei nem
címsorok, mert vendégnek szóló kijelző, nem dokumentum.
