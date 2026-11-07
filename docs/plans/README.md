# Tervek (`docs/plans/`)

A Koordinátor szál minden munkához (reggeli Jira áttekintés vagy eseti kérés) ide készít tervet, fájlnév: `ÉÉÉÉ-HH-NN.md` (több terv egy napon: `ÉÉÉÉ-HH-NN-<rövid-név>.md`). Folyamat: [`docs/WORKFLOW.md`](../WORKFLOW.md).

## Sablon

```markdown
# Terv — ÉÉÉÉ-HH-NN

Állapot: Jóváhagyásra vár | Jóváhagyva | Folyamatban | Lezárva

## Jegyek
| Jira | Cím | Típus | Méret | Függ |
| --- | --- | --- | --- | --- |
| KAN-12 | ... | NEW_FEATURE | S/M/L | – |

## Worker bontás
- Worker A (párhuzamos): KAN-12 — ág: KAN-12, érintett: apps/web/src/features/...
- Worker B (A után): KAN-13 — ág: KAN-13, érintett: apps/api/src/modules/...

## Elfogadási feltételek
- ...
- gate.sh zöld

## Újdonságok bejegyzések
- KAN-12 → NEW_FEATURE, link: receptionTab 'guests'
- KAN-13 → FIX, link nélkül

## Nyitott kérdések a Megrendelőnek
- ...
```
