# Tokenek: színek, téma, felületszín

Minden szín CSS-változóból jön. Komponensben csak a Tailwind tokenosztályokat
használd: `bg-background`, `bg-card`, `bg-muted`, `text-foreground`,
`text-muted-foreground`, `border-border`, `border-input`, `bg-primary`,
`text-primary-foreground`, `ring-ring`, `text-destructive`, `text-success`,
`text-warning`, az oldalsávon a `sidebar-*` tokenek. Így a sötét téma és a
felületszín váltása minden komponensben automatikusan működik, és nem kell `dark:`
párt írni.

## Alapértékek

Az `apps/web/src/app/styles/index.css` elejére (a `@tailwind` sorok után):

```css
@layer base {
  :root {
    --background: 220 20% 97%;      /* #f5f6f8 oldal háttér */
    --foreground: 215 24% 14%;      /* #1b222c */
    --card: 0 0% 100%;
    --card-foreground: 215 24% 14%;
    --popover: 0 0% 100%;
    --popover-foreground: 215 24% 14%;
    --muted: 216 20% 95%;           /* #f0f2f5 táblafejléc, hover */
    --muted-foreground: 213 14% 39%;/* #556170, 4.5:1 felett fehéren */
    --secondary: 0 0% 100%;         /* a másodlagos gomb háttere */
    --secondary-foreground: 215 24% 14%;
    --accent: 216 20% 95%;          /* shadcn hover-háttér, NEM a kiemelő szín */
    --accent-foreground: 215 24% 14%;
    --border: 216 17% 89%;          /* #dde1e7 */
    --input: 215 14% 80%;           /* #c5cbd3 mezők és másodlagos gomb kerete */
    --destructive: 0 74% 42%;       /* #b91c1c */
    --destructive-foreground: 0 0% 100%;
    --success: 142 72% 29%;         /* #15803d */
    --success-foreground: 0 0% 100%;
    --warning: 26 90% 37%;          /* #b45309 */
    --warning-foreground: 0 0% 100%;
    --radius: 0.375rem;             /* 6px: hagyományos, nem „buborékos” */

    /* Az oldalsáv mindkét témában sötét, lebegő kártya. */
    --sidebar: 216 18% 11%;              /* #171b21 */
    --sidebar-raised: 217 18% 14%;       /* #1e232b fiókpanel */
    --sidebar-foreground: 220 23% 97%;   /* #f7f8fa */
    --sidebar-muted-foreground: 240 5% 65%; /* #a1a1aa */
    --sidebar-border: hsl(0 0% 100% / 0.08); /* kész szín, nem hármas */
    --sidebar-hover: hsl(0 0% 100% / 0.06);
  }

  :root[data-theme='dark'],
  .reception-theme-dark {
    --background: 216 21% 7%;       /* #0e1115 */
    --foreground: 214 16% 91%;      /* #e5e8ec */
    --card: 216 19% 10%;            /* #161a20 */
    --card-foreground: 214 16% 91%;
    --popover: 216 19% 10%;
    --popover-foreground: 214 16% 91%;
    --muted: 217 18% 14%;           /* #1d222a */
    --muted-foreground: 214 13% 68%;/* #a3adba */
    --secondary: 216 19% 10%;
    --secondary-foreground: 214 16% 91%;
    --accent: 217 18% 14%;
    --accent-foreground: 214 16% 91%;
    --border: 215 17% 20%;          /* #2a313b */
    --input: 216 15% 27%;           /* #3a424e */
    --destructive: 0 91% 71%;       /* #f87171 */
    --destructive-foreground: 216 21% 7%;
    --success: 142 69% 58%;         /* #4ade80 */
    --success-foreground: 216 21% 7%;
    --warning: 43 96% 56%;          /* #fbbf24 */
    --warning-foreground: 216 21% 7%;

    --sidebar: 214 24% 6%;               /* #0b0e12, az oldalnál sötétebb */
    --sidebar-raised: 213 21% 10%;       /* #151a20 */
  }

  /* Felületszínek: a <html> data-surface-e választ (a Kékeszöld a jelöletlen alap). */
  :root, [data-surface='teal'] { --primary: 175 77% 26%; --sidebar-highlight: 172 66% 50%; }
  [data-surface='blue']     { --primary: 224 76% 48%; --sidebar-highlight: 213 94% 68%; }
  [data-surface='indigo']   { --primary: 245 58% 51%; --sidebar-highlight: 234 89% 74%; }
  [data-surface='burgundy'] { --primary: 336 74% 35%; --sidebar-highlight: 329 86% 70%; }
  [data-surface='amber']    { --primary: 26 90% 37%;  --sidebar-highlight: 43 96% 56%; }
  [data-surface='olive']    { --primary: 86 69% 23%;  --sidebar-highlight: 83 78% 55%; }

  /* A palettából számolt tokenek ott is, ahol egy színminta saját palettát kap. */
  :root, [data-surface] {
    --primary-foreground: 0 0% 100%;
    --ring: var(--primary);
    --primary-text: hsl(var(--primary));
    --primary-soft: hsl(var(--primary) / 0.1);
    --sidebar-accent: hsl(var(--sidebar-highlight) / 0.14);
  }
  /* Sötét témában a világos árnyalat a --primary, sötét felirattal. */
  :root[data-theme='dark'],
  :root[data-theme='dark'] [data-surface] {
    --primary: var(--sidebar-highlight);
    --primary-foreground: 216 21% 7%;
    --primary-soft: hsl(var(--primary) / 0.16);
  }

  * { @apply border-border; }
  body { @apply bg-background text-foreground; }
}
```

A `--primary` a felületszínből jön: világos témában a paletta telített színe,
sötétben a világos árnyalata (a link gomb így külön világosítás nélkül olvasható).
A Tailwind configban az oldalsáv színei: `sidebar` (`DEFAULT`, `raised`,
`foreground`, `muted`, `highlight` HSL-hármasból; `border`, `hover`, `accent` kész
színértékként, `var(...)`, ezért ezekre nem tehető átlátszóság-módosító).

## Felületszín a Beállításokban

A paletták listája a `shared/theme/surface.ts`-ben van (`SURFACE_COLORS`: `id`,
magyar név, a régi kiemelő szín hexája az átfordításhoz), a választás a
`useSurfaceStore`-ban (`zustand` + `persist`, localStorage
`reform_studio_surface`). Az értékek a `SKILL.md` 3.4 táblázatában.

```ts
// shared/theme/surface.ts
export const SURFACE_COLORS = [
  { id: 'teal', name: 'Kékeszöld', legacyHex: '#0f766e' },
  { id: 'blue', name: 'Kék', legacyHex: '#1d4ed8' },
  { id: 'indigo', name: 'Indigó', legacyHex: '#4338ca' },
  { id: 'burgundy', name: 'Bordó', legacyHex: '#9d174d' },
  { id: 'amber', name: 'Borostyán', legacyHex: '#b45309' },
  { id: 'olive', name: 'Olajzöld', legacyHex: '#3f6212' },
] as const;
```

- Az `app/ThemeSync` teszi a `<html>`-re a `data-theme`-et és a `data-surface`-t;
  az első kirajzolás előtt ugyanezt az `index.html` inline scriptje (a két
  localStorage kulcsból: `reform_studio_reception_theme`, `reform_studio_surface`,
  és a régi `reform_studio_accent` hexa átfordítása), így nincs villanás.
- Felületről váltani a `saveTheme(theme)` / `saveSurface(surface)` hívással kell
  (`@/shared/theme`): beállítja és menti, toast nélkül (a változás azonnal látszik).
- A Beállítások színmintái `ToggleGroupItem`-ek saját `data-surface`-szel és
  `bg-primary`-val, így mindegyik a saját palettáját mutatja, a sötét témában is;
  `aria-label` a szín nevével. Egyedi színválasztó nincs.
- A Vendégmonitorra (`.monitor-invariant`) a felületszín nem hat: ott a komponensek
  fix színeket használnak, nem a `--primary`-t.

## Térközök és betűméretek

A színek mellett a méretek is egy helyen vannak: a `SKILL.md` 3.6 (térközök) és 3.7
(betűk) táblázata, a `shared/ui` alapelemei ezeket adják. A legfontosabbak:

| Mi | Érték |
| --- | --- |
| Oldal belső margója | `px-4 pt-5`, `md:` `px-8 pt-8` |
| Blokkok között | `gap-4 md:gap-6` / `space-y-4 md:space-y-6` |
| `PageHeader` alatt | `mb-6 md:mb-8`, leírás `text-sm` |
| Kártya | fejléc / lábléc `px-4 py-4 md:px-5`, törzs `p-4 md:p-5` |
| Táblázat | `text-sm`, cella `px-4 py-3`, fejléc `px-4 py-2.5` |
| Űrlap | mezők között `space-y-4`, címke és mező között `gap-1.5` |

Új komponensben ezeket kövesd; ne sűríts vissza kisebb résre vagy 13 px-es táblaszövegre.

## Mire figyelj

- Nyers Tailwind színt (`bg-white`, `bg-slate-50`, `text-emerald-700`) új vagy
  átállított kódban ne használj. A régi oldalakon az átállításkor cseréld
  tokenre. Ha egy régi szín jelentést hordoz (pl. smaragd = sikeres beléptetés),
  az `success`, a borostyán `warning`, a rózsa `destructive`.
- Állapotot soha ne csak színnel jelezz: a `Badge` mindig szöveget is kap
  („Érvényes”, „Lejárt”).
- Árnyék: legfeljebb `shadow-sm` a kártyákon, `shadow-lg` a modálokon. Nincs
  színátmenet, nincs `backdrop-blur` a tartalomban.
