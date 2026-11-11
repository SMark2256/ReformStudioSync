# Terv — 2026-11-11 — Vendégmonitor kapcsolat

Állapot: Jóváhagyva (Márk, 2026-11-11)

Bejelentés: párosítás bontása után a monitor kapcsolódva maradt, a recepció egyre több kijelzőt mutatott (126), és párosítás után a beléptetés nem jelent meg a monitoron, miközben „Szinkron aktív” felirat látszott. Az adatbázisban a beléptetések rögzültek, a `display_devices` tábla üres. Render log nem volt elérhető (MCP 503), a Cloudflare Workeren nincs naplózás (és a socket nem is azon megy át); a gyökérokok a kódból igazolhatók.

## Gyökérokok
1. `useMonitorChannel`: a callbackek a minden rendernél új `options` objektumtól függnek → a socket effekt minden rendernél bont és újranyit; a szinkron `disconnect` esemény és a `MONITOR_STATE` broadcast önmagát gerjesztő újracsatlakozási hurkot okoz (monitor és recepció is).
2. `MonitorGateway.handleConnection`: az `await validateSocketToken` után akkor is regisztrál, ha a kliens közben bontott → beragadt bejegyzések, a kijelzőszám nő. A szám a munkatársi füleket is kijelzőnek számolja.
3. Visszavonáskor (törlés, új kód, önleválasztás) csak szobaüzenet megy, a szerver nem bontja az eszköz socketjeit; elutasított tokennél ok nélkül bont.
4. A monitor elutasított token mellett párosítva marad, és a „Szinkron aktív” felirat a valós szoba-tagságtól függetlenül látszik.

## Jegyek
| Jira | Cím | Típus | Méret | Függ |
| --- | --- | --- | --- | --- |
| TICKET-29 | Monitor-csatorna: a socket minden rendernél újracsatlakozik | FIX | M | – |
| TICKET-30 | Monitor gateway: beragadt kapcsolatok, hibás kijelzőszám | FIX | S | – |
| TICKET-31 | Párosítás bontása: a szerver bontja a kijelző kapcsolatát | FIX | M | TICKET-30 |
| TICKET-32 | Vendégmonitor: valós kapcsolatállapot, bontás és elutasítás kezelése | FIX | M | TICKET-29, TICKET-31 |

## Worker bontás
- Worker A (párhuzamos): TICKET-29 — ág: `TICKET-29` (`origin/demo`-ról), érintett: `apps/web/src/shared/lib/monitor-channel/`, web vitest bevezetése (`apps/web` + `gate.sh`), `e2e/` (socket.io stub).
- Worker B (A-val párhuzamosan): TICKET-30 — ág: `TICKET-30` (`origin/demo`-ról), érintett: `apps/api/src/modules/monitor/`.
- Worker C (B után): TICKET-31 — ág: `TICKET-31` (a `TICKET-30` ágról), érintett: `apps/api/src/modules/monitor/`, `apps/api/src/modules/auth/auth.service.ts`, `packages/shared/src/socket-events.ts` + contracts.
- Worker D (A és C után): TICKET-32 — ág: `TICKET-32` (a `TICKET-29` ágról, beolvasztva a `TICKET-31`-et), érintett: `apps/web/src/shared/lib/monitor-channel/`, `apps/web/src/pages/monitor/`, `e2e/`.
- A `demo` PR-ok sorrendje: TICKET-29, TICKET-30, TICKET-31, TICKET-32.

## Közös szerződés (TICKET-31 vezeti be, TICKET-32 használja)
- `SOCKET_EVENTS.MONITOR_AUTH_REJECTED = 'monitor:auth-rejected'`, payload: `MonitorAuthRejectedPayload { code: string; message: string; timestamp: string }` — a szerver elutasított tokennél bontás előtt küldi.
- Visszavonáskor a szerver a meglévő `MONITOR_DEVICE_REVOKED` eseményt közvetlenül az eszköz socketjeinek is elküldi, majd bontja őket.

## Elfogadási feltételek
- Egy megnyitott monitor és egy recepció egyetlen, tartós socket-kapcsolatot tart; újrarenderelés nem nyit újat.
- A recepció „Online (N kijelző)” száma a ténylegesen kapcsolódó kijelzőket mutatja (egy párosított kijelző → 1), és nem nő magától.
- Párosított kijelzőn a beléptetés megjelenik.
- A recepción törölt vagy új kódot kapott kijelző azonnal a párosítókód-képernyőre vált, a recepción offline-nak látszik.
- Elutasított tokennél a monitor nem írja, hogy „Élő Socket … Aktív”, és a párosítókód-képernyőre vált.
- Tesztek: api unit tesztek (TICKET-30, -31), web unit tesztek (TICKET-29, -32), E2E Playwright socket.io stubbal (TICKET-29, -32). CI zöld.

## Újdonságok bejegyzések
- TICKET-29 → FIX, link nélkül (a monitor megbízhatóan megjeleníti a beléptetést)
- TICKET-30 → FIX, link nélkül (helyes kijelzőszám)
- TICKET-31 → FIX, link nélkül (bontás után a kijelző kapcsolata megszűnik)
- TICKET-32 → FIX, link nélkül (a monitor valós kapcsolatállapotot mutat, bontás után kódot kér)

## Nyitott kérdések a Megrendelőnek
- Nincs. A Render log elérése (MCP újracsatlakoztatása) után a javítás a naplóban is visszaellenőrizhető.
