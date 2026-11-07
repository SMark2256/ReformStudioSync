---
name: reform-ticket
description: >
  ReformStudioSync Jira-ticket (KAN-NN, reformstudiosync.atlassian.net) végigvitele:
  ticket beolvasása, terv, jóváhagyás után implementáció a saját `KAN-NN` ágon,
  quality gate (typecheck, teszt, FSD lint, build), review, commit, majd PR a
  `demo` ágra, ott teszt, és sikeres teszt plusz „oké” után PR a `demo`-ról a
  `main`-re. Közben a Jira-ticket státuszát is lépteti (Teendő → Folyamatban →
  Ellenőrzés alatt → Kész). Használd mindig, ha a felhasználó KAN ticketet említ
  vagy ad („vidd végig a KAN-12-t”, „csináld meg a KAN-5-öt és a KAN-6-ot”,
  „hol tart a KAN-12”, „mehet a demo PR”, „tesztelve, mehet a main-re”), vagy
  ha ReformStudioSync feladatot ticketből, ágon, PR-ral kell lezárni, akkor is,
  ha a „ticket” vagy „Jira” szó nem hangzik el, csak egy KAN-szám.
---

# KAN ticket → `KAN-NN` ág → PR a `demo`-ra → teszt → PR a `main`-re

Ticketenként a folyamat: **ticket → terv → (jóváhagyás) → implementáció → gate →
review → commit → PR a `demo`-ra → teszt a demón → („oké”) → PR `demo` → `main`**.

Két ponton megállsz, és a felhasználóra vársz: **a terv után** és **a demós teszt
után**. Ezek a felhasználó döntései. A terv jóváhagyása egyben engedély az ágra,
a commitra és a ticket „Folyamatban” állapotára. A `demo` PR megnyitásához és a
`main` PR-hoz külön „mehet” kell, mert ezek kifelé látszó lépések.

A felhasználóval magyarul beszélj, röviden. A kódban és a commitokban a repó
meglévő stílusát kövesd.

## 0. Hol tart a munka?

Ha a felhasználó csak egy KAN-számot ad, vagy azt kérdezi, hol tart, először
nézd meg az állapotot, és onnan folytasd, ahol abbamaradt:

```bash
python .claude/skills/reform-ticket/scripts/reform_ticket.py show KAN-NN
git branch -a --list '*KAN-NN*'
gh pr list --state all --search "KAN-NN in:title"
```

- Nincs ág → 1. fázis.
- Van ág, nincs PR → a gate-től (4.) folytasd.
- Nyitott `demo` PR → a felhasználó tesztje kell (7.).
- Merge-ölt `demo` PR, nincs `main` PR → 8. fázis, ha a felhasználó már „okézta”.

## 1. Ticket és kontextus

```bash
python .claude/skills/reform-ticket/scripts/reform_ticket.py show KAN-NN
```

A script a leírást, az elfogadási feltételeket, a kommenteket, a szülő epicet és
az alfeladatokat adja vissza. A hitelesítést és a többi parancsot lásd itt:
`references/jira.md`.

Utána keresd meg az érintett kódot. A térkép:

- `apps/web/src`: React + Vite frontend, **Feature-Sliced Design** rétegekkel
  (`app → pages → widgets → features → entities → shared`). A rétegtáblázat a
  `docs/ARCHITECTURE.md` 1.2-es pontjában van.
- `apps/api/src/modules/*`: NestJS modulok, Prisma (`apps/api/prisma/schema.prisma`).
- `packages/shared/src`: közös DTO-k, enumok és socket események. Ha a web és az
  api közötti szerződés változik, itt kezdd.
- `apps/web/src/shared/api/mock-engine.ts`: kliensoldali mock backend a `/demo`
  oldalhoz és az offline fallbackhez. **Minden új vagy módosított API-végpontnak
  kell mock párja**, különben a demó és az offline mód eltörik.

Hibajavításnál használd a `diagnosing-bugs` skillt: reprodukálás, gyökérok, és
csak utána javítás.

## 2. Terv, utána megállsz

Röviden írd le:
- mit értettél meg a ticketből, és ha valami nem egyértelmű, mit kérdezel;
- mely fájlok és rétegek változnak (web / api / shared / mock);
- hogyan ellenőrzöd (gate, plusz kézi lépések a böngészőben);
- kockázatok: Prisma séma, socket események, offline puffer, a téma.

Itt **állj meg**, és várd meg a jóváhagyást. A ticketben lehetnek olyan döntések,
amelyeket a felhasználó másképp akar, és egy rossz irányú implementációt drágább
visszacsinálni, mint egy kérdést feltenni.

## 3. Ág és implementáció

A jóváhagyás után:

```bash
git fetch origin
git switch -c KAN-NN origin/main
python .claude/skills/reform-ticket/scripts/reform_ticket.py transition KAN-NN "Folyamatban"
```

Ha a munkakönyvtárban van commitolatlan, a tickethez nem tartozó változás, ne
vidd át az új ágra. Szólj, és kérdezd meg, mi legyen vele.

Az ág neve pontosan `KAN-NN`. A PR-keresés és a Jira–GitHub összekötés erre épít.

A projekt szabályai, amelyeket a kódnak követnie kell:

- **FSD rétegek.** Egy réteg csak az alatta lévőkből importál, és a slice-okat
  csak a publikus `index.ts`-ükön keresztül (`@/features/sell-pass`, nem
  `@/features/sell-pass/ui/...`). Új slice-nál add hozzá az `index.ts`-t. Ha
  bizonytalan vagy, hova kerüljön valami, a `npm run lint:fsd` megmondja.
- **Világos és sötét téma** minden recepciós/admin UI-ban (`.cursor/rules/theme-support.mdc`):
  `dark:` párok vagy a `.reception-theme-dark` szabályok. A Vendégmonitor
  (`/monitor`, `.monitor-invariant`) kivétel, az mindig fix sötét/smaragd.
- **Magyar felületi szöveg**, a meglévő hangnemben. A visszajelzés a
  `shared/lib/notify` toastjain megy, ne írj saját alertet.
- **Szkenner.** A `useBarcodeScanner` billentyűfigyelését semmi nem veheti el
  (focus trap, `stopPropagation` a capture fázisban). Ha új input jön a
  recepcióra, a `/reception` és a `/demo` oldalon is próbáld ki a szkennert.
- **Prisma.** Séma módosításakor `npm run db:generate`. Távoli adatbázison
  (`db:push`, `db:migrate`, seed) csak kifejezett kérésre dolgozz, mert az az élő
  stúdió adata.
- Felületet érintő munkánál használd az `impeccable` skillt.

## 4. Quality gate

```bash
bash .claude/skills/reform-ticket/scripts/gate.sh
```

Sorban futtatja: shared build, Prisma generate, typecheck (web + api), api
tesztek (vitest), `lint` (ESLint), `lint:fsd` (Steiger), web build. Az első
hibánál megáll. Hibánál javítsd, és futtasd újra. Ne kapcsold ki a szabályt, és
ne írd át a tesztet csak azért, hogy zöld legyen. Az ESLint warningjai nem
állítják meg a gate-et, de új kódban ne hozz létre újat.

Ha az api üzleti logikája változik (beléptetés, bérlet, pénzügy), írj vagy
bővíts tesztet a meglévő `*.spec.ts` mintájára.

Felületi változásnál indítsd el az appot (`run` skill, vagy `npm run dev:web`), és
nézd meg a változást a valódi oldalon világos és sötét témában is.

## 5. Review, utána commit

Csak ha kód változott: előbb `simplify`, aztán `code-review` (a `main`-hez
képest). A talált hibákat javítsd, és futtasd újra a gate-et.

Commit a `KAN-NN` ágon. A commit üzenet a repó stílusát követi (`feature: …`,
`fix: …`, `docs: …`), és tartalmazza a ticketszámot:

```
fix: KAN-12 dupla levonás javítása offline szinkronnál
```

## 6. PR a `demo` ágra (a felhasználó „mehet”-je után)

Mutasd meg az összefoglalót (mi változott, gate eredménye), és kérdezd meg, mehet-e
a PR. A részletek, például hogy mi a teendő, ha a `demo` ág még nem létezik:
`references/demo-es-main-pr.md`.

A PR után a Jira-ticket a következőket kapja:

```bash
python .claude/skills/reform-ticket/scripts/reform_ticket.py transition KAN-NN "Ellenőrzés alatt"
python .claude/skills/reform-ticket/scripts/reform_ticket.py comment KAN-NN "PR a demo ágra: <PR URL>"
```

## 7. Teszt a demón

Ez a felhasználó tesztje. A te feladatod, hogy könnyű legyen:
- adj egy rövid, kattintható tesztlistát: melyik oldalon, mit csináljon, és mit
  kell látnia (a ticket elfogadási feltételeiből);
- jelezd a hatásterületet is, vagyis azt, ami nem változott, de érinthette a
  módosítás (pl. a szkenner, az offline puffer, a monitor szinkron);
- ha a felhasználó hibát talál, javítsd ugyanazon a `KAN-NN` ágon, futtasd a
  gate-et, pushold, és a `demo` PR frissül.

Utána várj. A `main` felé csak kifejezett „oké” vagy „mehet a main” után lépsz.

## 8. PR `demo` → `main`, és lezárás

„Oké” után a `references/demo-es-main-pr.md` szerint nyiss PR-t a `demo`-ról a
`main`-re. Ha a ticket felhasználó számára látható újdonság, kérdezd meg, kell-e
verzióléptetés (`docs/versions/` és a `widgets/version-changelog`).

A `main` merge után:

```bash
python .claude/skills/reform-ticket/scripts/reform_ticket.py transition KAN-NN "Kész"
```

## 9. Beszámoló

Röviden, magyarul:
- a ticket és az ág, a PR linkje vagy linkjei;
- a gate eredménye (melyik lépés futott, zöld-e);
- mit nem ellenőriztél, vagy mit hagytál ki, és miért;
- a Jira-ticket jelenlegi státusza;
- mi a következő lépés, és kié.

## Több ticket egyszerre

Ticketenként külön ág és külön PR, mert így egy hibás ticket nem tartja vissza a
többit. Ha a T3 elérhető, ticketenként indíts külön worktree threadet, és te
koordinálj. Ha két ticket ugyanazokat a fájlokat érinti, jelezd előre, és azt
vidd előbb a `demo`-ra, amelyikre a másik épül.

## Kapcsolódó skillek

| Skill | Mikor | Fázis |
|---|---|---|
| `diagnosing-bugs` | hibajavító ticketnél | 1 |
| `impeccable` | felületet érintő munkánál | 3, 4 |
| `run` | a változás megnézése a futó appban | 4 |
| `simplify`, majd `code-review` | kódváltozásnál, commit előtt | 5 |
| `security-best-practices` | auth-, token- vagy jogosultság-változásnál | 5 |

Ha egy skill nem érhető el, hagyd ki, és a beszámolóban jelezd.
