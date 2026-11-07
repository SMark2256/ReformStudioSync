// ReformStudioSync ESLint flat config a teljes monorepóra (apps/api, apps/web, packages/shared).
// Futtatás: `npm run lint` / `npm run lint:fix` a gyökérből. Az FSD-szabályokat továbbra is a
// Steiger (`npm run lint:fsd`) ellenőrzi, ez a config a TypeScript- és React-szabályokat adja.
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.wrangler/**',
      'apps/api/prisma/migrations/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // A tsconfig-okon kívüli TS-fájlok (build- és tooling-configok, a Cloudflare Worker)
          // a `tsconfig.eslint.json`-nal kapnak típusinformációt.
          defaultProject: 'tsconfig.eslint.json',
          allowDefaultProject: ['apps/*/*.config.ts', 'apps/web/worker/*.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // `_`-ral kezdődő név: szándékosan nem használt paraméter / változó.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Nyers hibadobás helyett a TICKET-9 hibakódjai (`appError(...)`). Bevezetéskor figyelmeztetés.
      'no-restricted-syntax': [
        'warn',
        {
          selector: "ThrowStatement > :matches(NewExpression, CallExpression)[callee.name='Error']",
          message: 'Nyers `throw new Error(...)` helyett használd az `appError(...)`-t (hibakód-rendszer).',
        },
        {
          selector: 'ThrowStatement > NewExpression[callee.name=/Exception$/]',
          message: 'Nyers `throw new *Exception(...)` helyett használd az `appError(...)`-t (hibakód-rendszer).',
        },
      ],
    },
  },

  // A JS configfájlokon (tailwind, postcss, ez a fájl) nincs típusinformáció.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  // API (NestJS), a seed és a tooling-configok: Node környezet.
  // A `@typescript-eslint/consistent-type-imports` szándékosan nincs bekapcsolva: a Nest DI az
  // `emitDecoratorMetadata`-ra épül, és a csak típusként importált provider-osztály futáskor
  // eltűnne a konstruktor-metaadatból (`undefined` injektálás).
  {
    files: ['apps/api/**/*.ts', 'apps/web/*.config.ts'],
    languageOptions: { globals: globals.node },
  },

  // Web (React + Vite).
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['apps/web/worker/**/*.ts'],
    languageOptions: { globals: globals.serviceworker },
  },

  // Tesztek: a hibadobás itt a teszt része, nem a hibakód-rendszeré.
  {
    files: ['**/*.spec.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },

  // ÁTMENETI: a bevezetéskor már meglévő találatok figyelmeztetésként futnak, hogy a lint ne
  // álljon meg a mostani kódon. A javításuk külön ticket(ek)ben jön, utána a szabály visszaáll
  // `error`-ra (törlés ebből a blokkból). A tömeges forráskód-javítás most ütközne a párhuzamos
  // ágakkal (pl. TICKET-9 hibakód-rendszer).
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Explicit `any` (Prisma-rekord mapperek, socket payloadok, teszt-mockok) továbbgyűrűzése.
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-enum-comparison': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      // Kezeletlen promise-ok: `invalidateQueries` hívások, async eseménykezelők a JSX-ben, `bootstrap()`.
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-misused-promises': 'warn',
      // Store-metódusok destrukturálva, `async` mock-függvények `await` nélkül, nem használt importok.
      '@typescript-eslint/unbound-method': 'warn',
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      '@typescript-eslint/no-base-to-string': 'warn',
    },
  },
  {
    // ÁTMENETI (web): a React Compiler-alapú react-hooks szabályok a meglévő komponensekben.
    files: ['apps/web/src/**/*.{ts,tsx}'],
    rules: {
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-refresh/only-export-components': 'warn',
    },
  },
);
