# ReformStudioSync — Agent útmutató

Monorepo: `apps/api` (NestJS + Prisma), `apps/web` (React + Vite + Tailwind, Feature-Sliced Design), `packages/shared` (közös DTO-k, enumok). Részletek: `README.md`, `docs/ARCHITECTURE.md`. Belépő minden agentnek (skillek, szabályok): [`AGENTS.md`](AGENTS.md).

## Munkafolyamat

- Koordináció: **[`docs/WORKFLOW.md`](docs/WORKFLOW.md)**. A Megrendelő (Márk) csak a **Koordinátor szállal** kommunikál. A Koordinátor tervet készít (`docs/plans/`), jóváhagyás után ticketenként worker szálat indít saját worktree-ben, **megvárja mindet**, ellenőrzi az eredményt, majd jelent. Worker szál nem indít további szálat és nem kérdez közvetlenül a Megrendelőtől.
- Egy KAN ticket végigvitele: **`reform-ticket` skill** (`.claude/skills/reform-ticket/SKILL.md`) — `KAN-NN` ág → gate → PR a `demo`-ra → teszt → PR a `main`-re.
- Reggeli (07:00) Jira áttekintés → napi terv (a Jira hozzáférés beállítása után).

## Kötelező szabályok

- Minden felhasználó számára érzékelhető változáshoz bejegyzés kell az `apps/web/src/entities/release-note/model/releaseNotes.ts`-be (Újdonságok menü): kötelező `jiraKey` (KAN-NN); `link` csak `NEW_PAGE`/`NEW_FEATURE` esetén, és csak ha az újdonság ténylegesen megtekinthető.
- Minden `apps/web` felületi munkánál a **`reformstudio-ui-skill`** (`.claude/skills/reformstudio-ui-skill/SKILL.md`) az irányadó.
- FSD rétegszabályok (`npm run lint:fsd`), sötét/világos téma (`.cursor/rules/theme-support.mdc`), magyar UI szöveg.
- Jelentés előtt: `bash .claude/skills/reform-ticket/scripts/gate.sh`.
