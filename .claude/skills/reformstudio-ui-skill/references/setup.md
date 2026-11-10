# shadcn/ui bevezetése az `apps/web`-be

A web Tailwind **3.4**-et használ (`apps/web/package.json`). A shadcn CLI jelenlegi
verziója Tailwind 4-re generál, ezért **mindig a `shadcn@2.3.0`** CLI-t használd.
A hozzá tartozó dokumentáció: https://v3.shadcn.com/docs. A Tailwindet ne frissítsd
4-re ennek a skillnek a keretében: az külön ticket.

## 0. Mielőtt bármit telepítesz

Nézd meg, mi van már a repóban:

```
cat apps/web/tailwind.config.js
cat apps/web/src/app/styles/index.css
ls apps/web/src/shared/ui apps/web/src/shared/lib
rg -n "darkMode" apps/web/tailwind.config.js
rg -n "useThemeStore" apps/web/src --files-with-matches
rg -n "export (function|const) cn\b" apps/web/src
```

- Ha van már `cn()` helper (`clsx` + `tailwind-merge`), azt használd, ne hozz
  létre másodikat. Ha nincs: `apps/web/src/shared/lib/utils.ts`, és a `shared/lib`
  publikus `index.ts`-éből exportáld.
- Jegyezd fel, hogyan kapcsol most a sötét téma (`.reception-theme-dark` melyik
  elemre kerül). A Tailwind `darkMode`-nak erre kell figyelnie (lásd 2. pont).

## 1. Függőségek

```
npm install -w @reform/web class-variance-authority tailwindcss-animate
```

A Radix csomagokat a CLI komponensenként telepíti. Ha a CLI a monorepóban rossz
helyre telepítene, add hozzá kézzel az `apps/web/package.json`-höz.

## 2. Tailwind beállítás

`apps/web/tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
export default {
  // A meglévő témaváltó osztályra figyel, így a shadcn `dark:` osztályai is működnek.
  darkMode: ['selector', '.reception-theme-dark'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem', screens: { '2xl': '1400px' } },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        success: { DEFAULT: 'hsl(var(--success))', foreground: 'hsl(var(--success-foreground))' },
        warning: { DEFAULT: 'hsl(var(--warning))', foreground: 'hsl(var(--warning-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
      maxWidth: { content: '1400px' },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
```

Ha a config ESM (`export default`), a plugint importtal húzd be
(`import animate from 'tailwindcss-animate'`). A meglévő `extend` bejegyzéseket
(betűtípusok, monitor-színek) ne töröld, fésüld össze.

A `darkMode: ['selector', …]` a Tailwind 3.4.1-től működik. Ha a
`.reception-theme-dark` nem a `<html>`-en vagy egy közös ősön van, hanem
oldalanként, tedd át egy közös ősre (az `app` rétegben), különben a portálban
renderelt Radix elemek (Dialog, Select, Tooltip) nem kapják meg a sötét témát.

## 3. `components.json` (az `apps/web` gyökerében)

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/app/styles/index.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/shared/ui",
    "ui": "@/shared/ui",
    "utils": "@/shared/lib/utils",
    "lib": "@/shared/lib",
    "hooks": "@/shared/lib/hooks"
  },
  "iconLibrary": "lucide"
}
```

Az aliasok az FSD `shared` rétegére mutatnak. A `@/` aliasnak a `tsconfig.json`
és a `vite.config.ts` szerint már léteznie kell. Ellenőrizd.

## 4. Komponensek telepítése

Az `apps/web` mappából:

```
npx shadcn@2.3.0 add button input label textarea select checkbox radio-group switch \
  toggle-group table card badge alert dialog alert-dialog sheet tooltip dropdown-menu \
  separator breadcrumb progress skeleton scroll-area sidebar sonner
```

Telepítés után:

1. **Ellenőrizd a CSS-t.** A `2.3.0` init egyes esetekben Tailwind 4-es (OKLCH,
   `@theme`) CSS-t ír (shadcn-ui/ui #10254). Az `index.css`-ben csak
   `@tailwind base/components/utilities` és HSL-számhármas változók
   (`--primary: 175 77% 26%;`) lehetnek. Ha mást látsz, cseréld a
   `references/tokens.md` blokkjára.
2. **Publikus API.** A `src/shared/ui/index.ts` exportálja az összes komponenst.
   Máshonnan csak `@/shared/ui`-ból importálj (FSD szabály, `npm run lint:fsd`).
3. **Gombok.** Írd át a generált `button.tsx`-et a `references/components.md`
   szerinti három variánsra.
4. **Sonner.** A projekt már használja. A shadcn `sonner` wrapperét csak akkor
   tartsd meg, ha a `shared/lib/notify` erre épül át; két `<Toaster />` ne legyen.
5. **Sidebar hook.** A `sidebar` komponens hoz egy `use-mobile` hookot. Tedd a
   `shared/lib/hooks` alá, és a töréspontja legyen 768 px (`references/responsive.md`).

## 5. Ellenőrzés

```
npm run typecheck -w @reform/web
npm run lint:fsd -w @reform/web
npm run build -w @reform/web
```

Utána nyisd meg a `/reception` és a `/demo` oldalt világos és sötét témában. Az
új tokenek miatt a régi oldalak színei is elmozdulhatnak, ezt jelezd a
beszámolóban.
