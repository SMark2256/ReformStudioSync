# ReformStudioSync — Fejlesztési Munkafolyamat (Koordinátor + Worker szálak)

Ez a dokumentum rögzíti, hogyan érkeznek be, hogyan tervezzük, valósítjuk meg és dokumentáljuk a változásokat. Minden AI agent (Claude Code, Cursor, Codex) és fejlesztő számára kötelező.

Egy-egy Jira ticket végigvitelének lépéseit (ticket → terv → `KAN-NN` ág → gate → PR a `demo`-ra → teszt → PR a `main`-re) a **`reform-ticket` skill** írja le: [`.claude/skills/reform-ticket/SKILL.md`](../.claude/skills/reform-ticket/SKILL.md). Ez a dokumentum az e fölötti koordinációt rögzíti.

---

## 1. Szerepek

| Szerep | Ki / mi | Feladat |
| --- | --- | --- |
| **Megrendelő** | Márk | Csak a **Koordinátor szállal** kommunikál: jóváhagyja a tervet, tesztel a demón, „mehet”-et ad a PR-okra. |
| **Koordinátor szál** | Egyetlen, hosszan élő agent szál | Jira ticketek átnézése, terv készítése, worker szálak indítása, megvárása, eredményeik ellenőrzése, PR-ok és Újdonságok bejegyzések, jelentés a Megrendelőnek. |
| **Worker szál** | A Koordinátor által indított agent, saját git worktree-ben | Egy KAN ticket megvalósítása a `reform-ticket` skill 3–5. fázisa szerint (ág, implementáció, gate, review, commit), visszajelentés a Koordinátornak. |

**Alapszabályok**

- A Megrendelő **soha nem** kommunikál közvetlenül worker szállal; minden kérdés és eredmény a Koordinátoron keresztül megy.
- Worker szál nem indít további szálakat, és nem kérdez a Megrendelőtől — elakadásnál a Koordinátornak jelez.
- A Koordinátor **megvárja az összes általa indított worker szálat**, mielőtt összegző jelentést ad. Félkész állapotot nem jelent késznek.
- Ticketenként egy worker, egy worktree, egy `KAN-NN` ág és egy `demo` PR. A független ticketek párhuzamosan futnak; ha két ticket ugyanazokat a fájlokat érinti, sorban, és az megy előbb a `demo`-ra, amelyikre a másik épül.
- A két megállási pont a Megrendelőé: **a terv után** és **a demós teszt után**. A `demo` és a `main` PR-hoz külön „mehet” kell.

---

## 2. Napi ciklus

```mermaid
sequenceDiagram
    participant Cron as Reggeli ütemezett futás (07:00)
    participant Coord as Koordinátor szál
    participant Jira as Jira (KAN)
    participant User as Márk
    participant W as Worker szálak (worktree, KAN-NN ág)

    Cron->>Coord: Reggeli Jira áttekintés indítása
    Coord->>Jira: Új / módosult KAN ticketek lekérése
    Coord->>Coord: Triázs + napi terv (docs/plans/ÉÉÉÉ-HH-NN.md)
    Coord->>User: Terv + nyitott kérdések
    User-->>Coord: Jóváhagyás / módosítás
    Coord->>W: Worker indítása ticketenként
    W-->>Coord: Eredmény (ág, commit, gate kimenet)
    Coord->>Coord: Összes worker megvárása, review
    Coord->>User: Összefoglaló, „mehet a demo PR?”
    Coord->>Coord: PR-ok a demo-ra, Jira → Ellenőrzés alatt
    User-->>Coord: Teszt a demón, „oké”
    Coord->>Coord: PR demo → main, Jira → Kész
    Coord->>User: Összegző jelentés
```

### 2.1. Reggeli Jira áttekintés (ütemezett)

- **Időpont:** minden munkanap 07:00 (Europe/Budapest).
- **Futtatója:** a Koordinátor szál (ütemezett feladatként, pl. T3 Code `schedule_task` / Claude Code `/schedule`).
- **Előfeltétel:** Jira hozzáférés az agent számára (`JIRA_EMAIL` + `JIRA_API_TOKEN` / `JIRA_API_TOKEN_FILE`, lásd `.claude/skills/reform-ticket/references/jira.md`). A változók Windows felhasználói szinten vannak beállítva; ha egy agent munkamenet ezek felvétele előtt indult, onnan kell betöltenie. *Állapot: aktív — T3 ütemezett feladat, hétfőtől péntekig 07:00, a Koordinátor szálba jelent.*
- **Lekérdezés:** `python .claude/skills/reform-ticket/scripts/reform_ticket.py list --jql 'project=KAN AND statusCategory != Done AND updated >= -1d ORDER BY priority DESC'`
- **Kimenet:** napi terv a `docs/plans/` mappában (lásd 2.2), és rövid üzenet a Koordinátor szálban.

Az ütemezett futás promptja:

> Reggeli Jira áttekintés: a `reform-ticket` skill scriptjével kérd le az elmúlt nap új és módosult, nem lezárt KAN ticketjeit. Mindegyikhez: rövid összefoglaló, típus (NEW_FEATURE / NEW_PAGE / IMPROVEMENT / FIX), érintett FSD rétegek és modulok, becsült méret, függőségek, nyitott kérdések. Készítsd el a `docs/plans/ÉÉÉÉ-HH-NN.md` tervet a `docs/plans/README.md` sablonja szerint, és küldd el jóváhagyásra. Worker szálat jóváhagyás előtt ne indíts, a Jirába ne írj.

### 2.2. Terv

Minden munkához (a reggeli áttekintésből vagy eseti kérésből) a Koordinátor tervet készít a `docs/plans/` mappába — sablon: [`docs/plans/README.md`](plans/README.md). A terv tartalmazza a ticketeket, a worker-bontást (mi fut párhuzamosan, mi sorban), az elfogadási feltételeket, a tervezett Újdonságok bejegyzéseket és a nyitott kérdéseket. **Megvalósítás csak jóváhagyott terv alapján indul.**

### 2.3. Worker szálak

A Koordinátor minden workernek önálló, teljes briefet ad:

- KAN kulcs, a ticket szövege és a terv vonatkozó része.
- Utasítás: a `reform-ticket` skill 3–5. fázisa szerint dolgozzon (`KAN-NN` ág, implementáció, `gate.sh`, `simplify` + `code-review`, commit). PR-t a worker nem nyit, Jirába nem ír.
- Érintett FSD rétegek/fájlok, kötelező projektszabályok (lásd 4. pont).
- Ha a ticket felhasználó számára látható változás: Újdonságok bejegyzés ugyanabban a commitban (lásd 3. pont).
- Visszajelentés formája: ág, commit SHA, gate kimenete, kézi ellenőrzés, nyitott kérdések.

### 2.4. Lezárás

1. Koordinátor ellenőrzi a worker eredményeket (review, gate újrafuttatása).
2. „Mehet” után PR-ok a `demo`-ra, Jira → *Ellenőrzés alatt*, tesztlista a Megrendelőnek.
3. „Oké” után PR `demo` → `main`, merge után Jira → *Kész*.
4. A `main` merge után **Kiadás** (2.5): tag, GitHub Release, utána új verzió nyitása a demón.
5. Összegző jelentés a Megrendelőnek: mi készült el, mi maradt nyitva, melyik ticket milyen állapotban van.

### 2.5. Kiadás (a `demo` → `main` PR összevonása után)

A verziószám egyetlen forrása a gyökér `package.json` `version` mezője (a workspace-ek `package.json`-ja és a `package-lock.json` ugyanezt tükrözi). A web a buildben kapja meg (`__APP_VERSION__`, `apps/web/vite.config.ts`), és `shared/config` (`APP_VERSION_LABEL`, pl. „v0.3”) mutatja a bejelentkezőoldalon, a Vendégmonitor fejlécében és az oldalsáv alján. A `demo` mindig a **következő**, még ki nem adott verzión áll; a `main`-re kerüléskor ez lesz a kiadás.

A Koordinátor a `main` merge után (a példa a v0.3):

1. **CHANGELOG véglegesítése:** a `CHANGELOG.md` `## v0.3 — a demo-n …` címsora helyett `## v0.3 — <a main merge dátuma, ÉÉÉÉ-HH-NN>`; a szakasz tételeit vesd össze az Újdonságok 0.3-as bejegyzéseivel.
2. **Tag a `main` merge commitjára:**
   ```bash
   git fetch origin
   git tag -a v0.3.0 origin/main -m "v0.3"   # origin/main = a demo → main merge commit
   git push origin v0.3.0
   ```
3. **GitHub Release** a CHANGELOG adott szakaszával (`scripts/release-notes.sh` csak kivágja, nem taggel és nem pushol):
   ```bash
   bash scripts/release-notes.sh 0.3 > <ideiglenes fájl>
   gh release create v0.3.0 --title "v0.3" --notes-file <ideiglenes fájl>
   ```
4. **Új verzió nyitása a demón** (külön ág, PR a `demo`-ra, pl. `release/v0.4`):
   - verzió minor emelése mindenhol: `npm version 0.4.0 --workspaces --include-workspace-root --no-git-tag-version` (a négy `package.json` és a `package-lock.json` saját `version` mezői; nézd át a diffet);
   - a CHANGELOG 1. pont szerinti dátuma, és fölé új szakasz: `## v0.4 — a demo-n, a következő main kiadással élesedik`;
   - innentől az Újdonságok új bejegyzései `version: '0.4'`-et kapnak.
   Az Újdonságok-teszt (`entities/release-note/model/releaseNotes.test.ts`) elbukik, ha egy bejegyzés verziója nagyobb a `package.json`-énál, vagy ha egy 0.3-tól kezdődő bejegyzésnek nincs `jiraKey`-je.
5. Jelentés a Megrendelőnek: a Release linkje és az új demós verzió.

---

## 3. Újdonságok bejegyzés (`apps/web/src/entities/release-note/model/releaseNotes.ts`)

A Recepció **„Újdonságok”** menüpontja (`pages/reception/ui/WhatsNewPanel.tsx`) és a bejelentkezőoldal verzió-ablaka (`widgets/version-changelog`) a `RELEASE_NOTES` tömbből épül. Minden felhasználó számára érzékelhető változáshoz kell bejegyzés.

| Mező | Szabály |
| --- | --- |
| `id` | Stabil, egyedi (pl. `v0.3-guest-export`). Utólag nem módosítható — erre épül az olvasottság jelölése. |
| `version` | A `demo` jelenlegi verziója major.minor alakban (a gyökér `package.json`-ból, pl. `0.3.0` → `'0.3'`); nagyobb nem lehet (unit teszt ellenőrzi). |
| `kind` | `NEW_PAGE` (új oldal), `NEW_FEATURE` (új funkció), `IMPROVEMENT` (fejlesztés), `FIX` (javítás). |
| `jiraKey` | **Kötelező** KAN kulcs (pl. `KAN-12`) a visszakövethetőséghez. `null` csak a Jira előtti (≤ v0.2) tételeknél megengedett. |
| `link` | **Csak** `NEW_PAGE` / `NEW_FEATURE` esetén, és **csak ha az újdonság a felületen ténylegesen megtekinthető**. Recepciós fülre: `{ type: 'receptionTab', tab }`, külön oldalra: `{ type: 'route', path }`. `IMPROVEMENT` / `FIX` esetén csak leírás van — a típus ezt kikényszeríti. |
| `summary`, `details` | Recepciós nyelven, nem műszaki szakszavakkal. |

- A legújabb bejegyzés a tömb elejére kerül.
- A jegyazonosító a Jira ticketre linkel (`https://reformstudiosync.atlassian.net/browse/KAN-NN`; felülírható: `VITE_JIRA_BASE_URL`).
- A még nem látott bejegyzések számát piros jelvény mutatja a menüpontban; megnyitáskor „Új” címkét kapnak.

---

## 4. Kötelező projektszabályok (minden szál számára)

- **FSD rétegek:** importálni csak alsóbb rétegből, slice-ot csak a publikus `index.ts`-én keresztül (`docs/ARCHITECTURE.md` 1.2, `npm run lint:fsd`).
- **UI-irány:** minden `apps/web` felületi munkánál a [`reformstudio-ui-skill`](../.claude/skills/reformstudio-ui-skill/SKILL.md) a mérvadó (tokenek, három gombvariáns, keret, oldalak, ellenőrzőlista).
- **Sötét/Világos téma:** minden új UI elem támogatja mindkét témát (`.cursor/rules/theme-support.mdc`; új kódban tokenosztályokkal). Kivétel: a Vendégmonitor fix dizájnja.
- **Nyelv:** felhasználói felület és dokumentáció magyarul.
- **Mock pár:** minden új vagy módosított API-végponthoz `shared/api/mock-engine.ts` pár.
- **Tranzakciók:** bérlet-/pénzügyi módosítás csak atomi Prisma `$transaction`-ben.
- **Gate jelentés előtt:** `bash .claude/skills/reform-ticket/scripts/gate.sh`. Sikertelen ellenőrzést kimenettel együtt kell jelenteni.
- **Dokumentáció:** architektúra-változás → `docs/ARCHITECTURE.md`; kiadás → `CHANGELOG.md` (2.5); minden felhasználói változás → Újdonságok bejegyzés.
