# Terv — 2026-11-11 — Verziókezelés és kiadás

Állapot: Folyamatban (TICKET-44)

Kérés (Márk): a demón is vezessük a kiadásokat, hogy a `main`-re küldéskor a verzió egyből ott legyen. A demón a v0.3 gyűlik; kell egy átfogó, a korábbi verziókat is tartalmazó kiadási jegyzék.

## Jegy
| Jira | Cím | Típus | Méret |
| --- | --- | --- | --- |
| TICKET-44 | Verziókezelés: egy helyen a verziószám, Újdonságokból épülő verzió-ablak, kiadás a main-re küldéskor | IMPROVEMENT | S–M |

## Tartalom
1. **Verziószám egy helyen:** `package.json` (gyökér és workspace-ek) `0.3.0`. A web a buildben kapja meg (Vite `define`); a bejelentkezőoldal verziójelvénye (`VersionBadge`) és a Vendégmonitor fejléc-chipje ebből olvas (most be van égetve: „v0.2”).
2. **Verzió-ablak az Újdonságokból:** a `VersionChangelogModal` a `RELEASE_NOTES`-ból épül, verziónként csoportosítva, a jelenlegi verzió elöl; a kézzel írt v0.2-es tartalom megszűnik. A v0.1 tételei bekerülnek a `releaseNotes.ts`-be (`jiraKey: null`).
3. **`CHANGELOG.md`** a repó gyökerében: összesített, verziónkénti kiadási jegyzék (v0.1–v0.3).
4. **Kiadás:** a demo → main PR összevonása után a Koordinátor: `git tag v<verzió>` + `gh release create` a `CHANGELOG.md` adott verziójú részével. Leírás: `docs/WORKFLOW.md`, `reform-ticket` skill.
5. **Új verzió nyitása:** kiadás után a demón a verzió 0.4.0-ra emelkedik; unit teszt ellenőrzi, hogy egy Újdonságok-bejegyzés verziója sem nagyobb a `package.json` verziójánál.

## Elfogadási feltételek
- A demón a bejelentkezőoldalon és a Vendégmonitoron „v0.3” látszik; a jelvényre kattintva a verzió-ablak v0.3, v0.2, v0.1 szerint mutatja a változásokat.
- A `main`-re kerüléskor létrejön a `v0.3.0` tag és a GitHub Release.
- CI zöld; kézi teszt világos és sötét témában.
