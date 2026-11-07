# Jira (reformstudiosync.atlassian.net, `KAN` projekt)

## Hitelesítés

A script két környezeti változót olvas:

- `JIRA_EMAIL`: az Atlassian fiók e-mail címe.
- `JIRA_API_TOKEN`: API token (https://id.atlassian.com/manage-profile/security/api-tokens).
  Helyette megadhatod a `JIRA_API_TOKEN_FILE` változót is, egy fájl útvonalával,
  amelyben a token van.

Opcionális: `JIRA_BASE_URL` (alapértelmezés `https://reformstudiosync.atlassian.net`).

A tokent soha ne írd a repóba, a chatbe vagy a commitba. Ha hiányzik, kérd el a
felhasználótól biztonságos úton (T3-ban `request_secret`, `delivery: "file"`, és
add át a `JIRA_API_TOKEN_FILE`-on keresztül).

## Parancsok

```bash
S=.claude/skills/reform-ticket/scripts/reform_ticket.py
python $S show KAN-12                     # összefoglaló: leírás, státusz, epic, alfeladatok, kommentek
python $S list                            # nyitott KAN ticketek (Kész nélkül)
python $S list --jql 'project=KAN AND status="Teendő"'
python $S transitions KAN-12              # elérhető átmenetek
python $S transition KAN-12 "Folyamatban" # átmenet célstátusz neve alapján
python $S comment KAN-12 "PR a demo ágra: https://github.com/..."
```

A `show`, a `list` és a `transitions` csak olvas. A `transition` és a `comment`
a felhasználó nevében ír a Jirába.

## Státuszok és mikor lépteted

| Státusz | Mikor |
|---|---|
| Teendő | kiinduló állapot |
| Folyamatban | a terv jóváhagyása után, az ág létrehozásakor |
| Ellenőrzés alatt | a `demo` PR megnyitása után (a felhasználó tesztel) |
| Kész | a `main` PR merge-e után |

Máskor ne írj a Jirába. Ha a felhasználó kéri, kommentelhetsz kérdést is a
ticketre (pl. egy nem egyértelmű elfogadási feltételről), de előtte mutasd meg a
szöveget.

## Ha valami nem stimmel

- `401`: rossz vagy lejárt token, vagy nem az a fiók e-mail cím.
- `404` a ticketre: elírt kulcs, vagy a fióknak nincs joga a projekthez.
- Nincs ilyen átmenet: a `transitions` kiírja, mi érhető el. Lehet, hogy a
  ticket már abban az állapotban van.
