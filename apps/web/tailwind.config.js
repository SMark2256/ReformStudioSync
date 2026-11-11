import animate from 'tailwindcss-animate';
import plugin from 'tailwindcss/plugin';

/** @type {import('tailwindcss').Config} */
export default {
  // A `dark:` variáns a meglévő témaváltó osztályra (`.reception-theme-dark`) figyel. A
  // specifikáció `['selector', …]` beállítása `:where()`-rel nulla specificitást adna, és a régi
  // oldalakon a `hover:` felülírná a `dark:` párt; ez a korábbi `class` stratégiával azonos
  // `:is(… *)` szelektort ad. Új kódban `dark:` helyett tokenosztály kell.
  darkMode: ['variant', '&:is(.reception-theme-dark *)'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f7f6',
          100: '#e4ebe7',
          200: '#cad8d1',
          300: '#a4bdb1',
          400: '#789b8b',
          500: '#587e6e',
          600: '#446457',
          700: '#385147',
          800: '#2f423b',
          900: '#283832',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        faint: 'hsl(var(--faint))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          // A kiemelő szín szövegként (link, aktív menüpont); sötét témában világosítva.
          text: 'var(--primary-text)',
          // Halvány háttér: aktív menüpont, kijelölt táblasor (sötétben erősebb).
          soft: 'var(--primary-soft)',
        },
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
      // `md` = 6 px (`--radius`), `lg` = 8 px, `sm` = 4 px (UI-specifikáció 3.5). Az `md` és az
      // `lg` megegyezik a Tailwind alapértékével, így a régi oldalak lekerekítése nem változik.
      borderRadius: {
        lg: 'calc(var(--radius) + 2px)',
        md: 'var(--radius)',
        sm: 'calc(var(--radius) - 2px)',
      },
      maxWidth: { content: '1400px' },
    },
  },
  plugins: [
    animate,
    // Érintőképernyő (`pointer: coarse`): 44 px-es célterület a gombokon és a mezőkön.
    plugin(({ addVariant }) => addVariant('coarse', '@media (pointer: coarse)')),
  ],
};
