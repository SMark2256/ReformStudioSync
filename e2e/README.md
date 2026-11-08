# E2E tesztek (Playwright, mock-módban)

Böngészős tesztek a fő recepciós folyamatokra. API és adatbázis nélkül futnak.

```bash
npx playwright install chromium   # egyszer
npm run test:e2e                  # összes teszt
npm run test:e2e -- e2e/check-in.spec.ts --headed   # egy fájl, látható böngészővel
npm run test:e2e:ui               # interaktív UI
npx playwright show-trace test-results/<teszt>/trace.zip   # hiba utáni trace
```

## Hogyan kerül a web mock-módba?

- A `playwright.config.ts` `webServer`-e a webet `VITE_API_URL=http://127.0.0.1:9/api`
  címmel buildeli (`.e2e-dist/`), és `vite preview`-val szolgálja ki a `5180`-as porton
  (`E2E_PORT`-tal módosítható). A 9-es portot a böngésző tiltja, így minden API-hívás
  azonnal `TypeError: Failed to fetch`-csel elhasal.
- A `shared/api/client.ts` `request()` hálózati hibánál a kliensoldali mock-motorra
  (`shared/api/mock-engine.ts`) vált. A mock-állapot a `localStorage`-ben van
  (`reform-studio-mock-sandbox-v2`), ezért minden teszt friss böngészőkontextusban,
  a kiinduló demóadatokkal indul.
- Biztonsági háló: az `e2e/fixtures.ts` minden `/api/...` kérést megszakít, így
  valódi API-címmel buildelt szerver mellett is a mock-motor fut.
- Dev szerver helyett azért preview, mert a Vite dev futás közbeni
  függőség-optimalizálása oldal-újratöltést okozott (flaky tesztek).

## Belépés mock-módban

Az `api.login`-nak nincs mock párja: a `/login` oldalon a „Belépés a Recepciós
Pultra” gomb a hálózati hiba után helyi munkamenettel léptet be
(`accessToken: 'local-session-token'`, a `reform-studio-auth` kulcson), és a
`/reception`-re visz. Ugyanebben a böngészőkontextusban a `/monitor` is jogosult
lesz. Belépés nélkül a `/monitor` a párosító nézetet mutatja. A `/demo` sandbox
belépés nélkül is működik. Segédfüggvény: `loginToReception()` az `e2e/fixtures.ts`-ben.

## Mock-adatok, amelyekre a tesztek építenek

| Vonalkód | Vendég | Állapot |
|---|---|---|
| 100001 | Kovács Anna | havi tagság + 10 alkalmas Hypoxi (7 alk.) |
| 100003 | Szabó Eszter | havi tagság + 10 alkalmas Reformer (2 alk.) |
| 100005 | Varga Judit | nincs tagság, kimerült bérlet (0 alk.) |

## Regressziós tesztek (`test.fixme`)

A TICKET-1–4 hibáira írt tesztek `test.fixme(...)`-vel vannak jelölve, és a nevük
a ticketszámmal kezdődik. A hibát javító ticketben a `fixme`-t `test`-re kell
cserélni, és a tesztnek zöldnek kell lennie. Egy-egy ticket tesztjei:
`npm run test:e2e -- -g "TICKET-2"`.

| Ticket | Fájl |
|---|---|
| TICKET-1 | `check-in.spec.ts` |
| TICKET-2 | `monitor.spec.ts` |
| TICKET-3 | `guests.spec.ts` |
| TICKET-4 | `sell-pass.spec.ts` (a vendégválasztó szerepét a javítás dönti el, a lokátort ahhoz kell igazítani) |
