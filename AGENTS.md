# ReformStudioSync — Belépő minden agentnek

Ez a fájl minden AI agentnek szól (Codex, Cursor, Claude Code és a többi). A Claude-specifikus kiegészítések: [`CLAUDE.md`](CLAUDE.md).

## Monorepo

`apps/api` (NestJS + Prisma), `apps/web` (React + Vite + Tailwind, Feature-Sliced Design), `packages/shared` (közös DTO-k, enumok). Részletek: [`README.md`](README.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Skillek

A projekt skilljei a `.claude/skills/` alatt vannak. Nem csak Claude-nak szólnak: ha az agented nem tölti be őket automatikusan, a feladat előtt olvasd el a `SKILL.md`-t és a hozzá tartozó `references/` fájlokat, és ezek szerint dolgozz.

| Skill | Mikor kell használni |
| --- | --- |
| [`reform-ticket`](.claude/skills/reform-ticket/SKILL.md) | Egy Jira-ticket (`TICKET-NN`) végigvitele: ág, implementáció, gate, review, commit, PR a `demo`-ra, majd a `main`-re. |
| [`reformstudio-ui-skill`](.claude/skills/reformstudio-ui-skill/SKILL.md) | **Minden `apps/web` felületi munkánál** (új vagy átállított oldal, komponens, űrlap, táblázat, modál, menü, téma, mobil nézet, akadálymentesség). Ez a mérvadó UI-irány: tokenek, három gombvariáns, keret, oldalak, ellenőrzőlista. Kattintható prototípus: [`references/prototype/index.html`](.claude/skills/reformstudio-ui-skill/references/prototype/index.html). |

Ha egy régebbi szabály vagy dokumentum a felületről mást mond, a `reformstudio-ui-skill` az irányadó.

## Munkafolyamat

Koordinátor és worker szálak, tervek, Újdonságok: [`docs/WORKFLOW.md`](docs/WORKFLOW.md).

## CI

- Push után a CI-ra KIZÁRÓLAG így várj, háttérfeladatként: `bash scripts/ci-wait.sh`
- SOHA ne írj saját sleep/poll ciklust, és ne futtasd a `gh pr checks --watch`-ot.
- CI FAIL esetén: `gh run view --log-failed`, javítás, push, utána újra ci-wait.
- CI TIMEOUT vagy ERROR esetén NE próbáld újra: állj meg, és jelezd, melyik check ragadt be.

A [`scripts/ci-wait.sh`](scripts/ci-wait.sh) az aktuális ág PR-ját figyeli (vagy a megadott PR-számot / ágat). A PR checkjei mellett a commit GitHub Actions futásait is nézi, így a sorban álló, még job nélküli futást sem veszi zöldnek. Utolsó sora `CI PASS` / `CI FAIL` / `CI TIMEOUT` / `CI ERROR`, a kilépési kód 0 / 1 / 2 / 3; az időkorlát `CI_WAIT_TIMEOUT` (alap 1800 mp).

## Kötelező szabályok

- **Újdonságok:** minden felhasználó számára érzékelhető változáshoz bejegyzés az `apps/web/src/pages/reception/model/releaseNotes.ts`-be, kötelező `jiraKey`-jel ([`docs/WORKFLOW.md`](docs/WORKFLOW.md), [`.cursor/rules/release-notes.mdc`](.cursor/rules/release-notes.mdc)).
- **UI:** `apps/web` felületi munkánál a [`reformstudio-ui-skill`](.claude/skills/reformstudio-ui-skill/SKILL.md) szerint ([`.cursor/rules/ui-design.mdc`](.cursor/rules/ui-design.mdc)).
- **Téma:** világos és sötét téma mindenhol ([`.cursor/rules/theme-support.mdc`](.cursor/rules/theme-support.mdc)); a Vendégmonitor kivétel.
- **FSD rétegek:** `npm run lint:fsd` ([`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) 1.2).
- **Nyelv:** magyar felületi szöveg.
- A többi projektszabály (mock pár, tranzakciók, dokumentáció): [`docs/WORKFLOW.md`](docs/WORKFLOW.md) 4. pont.
- **Jelentés előtt:** `bash .claude/skills/reform-ticket/scripts/gate.sh` legyen zöld.
