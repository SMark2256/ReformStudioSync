# Tokenek: színek, téma, kiemelő szín

Minden szín CSS-változóból jön. Komponensben csak a Tailwind tokenosztályokat
használd: `bg-background`, `bg-card`, `bg-muted`, `text-foreground`,
`text-muted-foreground`, `border-border`, `border-input`, `bg-primary`,
`text-primary-foreground`, `ring-ring`, `text-destructive`, `text-success`,
`text-warning`. Így a sötét téma és a kiemelő szín váltása minden komponensben
automatikusan működik, és nem kell `dark:` párt írni.

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
    --primary: 175 77% 26%;         /* #0f766e kiemelő szín, állítható */
    --primary-foreground: 0 0% 100%;
    --ring: var(--primary);
    --destructive: 0 74% 42%;       /* #b91c1c */
    --destructive-foreground: 0 0% 100%;
    --success: 142 72% 29%;         /* #15803d */
    --success-foreground: 0 0% 100%;
    --warning: 26 90% 37%;          /* #b45309 */
    --warning-foreground: 0 0% 100%;
    --radius: 0.375rem;             /* 6px: hagyományos, nem „buborékos” */

    --sidebar-background: 0 0% 100%;
    --sidebar-foreground: 213 14% 39%;
    --sidebar-primary: var(--primary);
    --sidebar-primary-foreground: var(--primary-foreground);
    --sidebar-accent: 216 20% 95%;
    --sidebar-accent-foreground: 215 24% 14%;
    --sidebar-border: 216 17% 89%;
    --sidebar-ring: var(--primary);
  }

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

    --sidebar-background: 216 19% 10%;
    --sidebar-foreground: 214 13% 68%;
    --sidebar-accent: 217 18% 14%;
    --sidebar-accent-foreground: 214 16% 91%;
    --sidebar-border: 215 17% 20%;
  }

  * { @apply border-border; }
  body { @apply bg-background text-foreground; }
}
```

A `--primary` sötét témában is ugyanaz: a felhasználó által választott szín.
Sötét háttéren a link gomb világosított változatot kap (`components.md`).

## Kiemelő szín a Beállításokban

A kiemelő szín felhasználónként mentődik (első körben `zustand` + `persist`,
localStorage, később az API-ba). A téma store-ja mellé, az `entities` vagy
`shared` rétegbe, ahol most a `useThemeStore` van:

```ts
// shared/lib/theme/accent.ts
export const ACCENT_PRESETS = [
  { hex: '#0f766e', name: 'Kékeszöld' },
  { hex: '#1d4ed8', name: 'Kék' },
  { hex: '#4338ca', name: 'Indigó' },
  { hex: '#9d174d', name: 'Bordó' },
  { hex: '#b45309', name: 'Borostyán' },
  { hex: '#3f6212', name: 'Olajzöld' },
  { hex: '#334155', name: 'Palaszürke' },
  { hex: '#111827', name: 'Fekete' },
] as const;

export function hexToHslTriplet(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// WCAG relatív fényesség alapján fekete vagy fehér felirat.
export function foregroundFor(hex: string): string {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.179 ? '222 47% 11%' : '0 0% 100%';
}

export function applyAccent(hex: string) {
  const root = document.documentElement;
  root.style.setProperty('--primary', hexToHslTriplet(hex));
  root.style.setProperty('--primary-foreground', foregroundFor(hex));
}
```

- Az `applyAccent`-et az `app` rétegben hívd meg indításkor és változáskor (ott,
  ahol a téma osztálya is felkerül).
- A Beállítások oldalon: a preset színek `ToggleGroup`-ban (minden elem
  `aria-label` a szín nevével), mellette `<input type="color">` `Label`-lel
  („Egyedi kiemelő szín”). Egyedi színnél írd ki: „Ügyelj rá, hogy a szöveg jól
  olvasható maradjon.” Ha a választott szín kontrasztja fehér háttéren 3:1 alatt
  van, figyelmeztess a mező alatt, a mentést ne tiltsd.
- A Vendégmonitorra (`.monitor-invariant`) az `applyAccent` nem hat: ott a
  komponensek fix színeket használnak, nem a `--primary`-t.

## Mire figyelj

- Nyers Tailwind színt (`bg-white`, `bg-slate-50`, `text-emerald-700`) új vagy
  átállított kódban ne használj. A régi oldalakon az átállításkor cseréld
  tokenre. Ha egy régi szín jelentést hordoz (pl. smaragd = sikeres beléptetés),
  az `success`, a borostyán `warning`, a rózsa `destructive`.
- Állapotot soha ne csak színnel jelezz: a `Badge` mindig szöveget is kap
  („Érvényes”, „Lejárt”).
- Árnyék: legfeljebb `shadow-sm` a kártyákon, `shadow-lg` a modálokon. Nincs
  színátmenet, nincs `backdrop-blur` a tartalomban.
