# PR a `demo`-ra, majd `demo` → `main`

A web a Vercelen fut (`apps/web/vercel.json`), az api a Renderen (`render.yaml`).
A `demo` ág a tesztkörnyezet: ide kerül minden ticket, mielőtt a `main`-re menne.
A Vercel a `demo` ágra preview deployt készít. Ennek az URL-jét a PR-ban vagy a
Vercel felületén találod, ezt add a felhasználónak a teszthez.

## Ha a `demo` ág még nem létezik

```bash
git ls-remote --heads origin demo
```

Ha üres, a `demo` ágat a `main`-ből kell létrehozni. Ez kifelé látszó lépés, ezért
előbb kérdezd meg a felhasználót. Jóváhagyás után:

```bash
git push origin origin/main:refs/heads/demo
```

## Ticket ág → `demo`

```bash
git push -u origin KAN-NN
gh pr create --base demo --head KAN-NN \
  --title "KAN-NN: <ticket címe>" \
  --body-file <ideiglenes fájl>
```

A PR leírása:

```
Jira: https://reformstudiosync.atlassian.net/browse/KAN-NN

## Mi változott
- …

## Ellenőrzés
- gate: shared build, prisma generate, typecheck, api teszt, lint:fsd, web build ✅
- kézi: …

## Teszt a demón
- [ ] …
```

Ha a `demo` közben előrébb jár, és ütközés van, a `KAN-NN` ágat rebase-eld az
`origin/demo`-ra, ne merge-eld bele a `demo`-t. Így a ticket ág tiszta marad a
`main` felé is.

A `demo` PR-t a felhasználó merge-eli, hacsak nem kéri tőled kifejezetten.

## `demo` → `main`

Csak a felhasználó „oké”-ja után, és ha a ticket `demo` PR-ja már merge-ölve van.

```bash
git fetch origin
git log --oneline origin/main..origin/demo   # mi megy át a main-re
```

Ha a `demo`-n más, még nem tesztelt ticket is van, **szólj előtte**, mert a
`demo` → `main` PR azt is viszi. Ilyenkor a felhasználó dönti el, hogy megvárja-e
a másik ticket tesztjét.

```bash
gh pr create --base main --head demo \
  --title "demo → main: KAN-NN[, KAN-MM]" \
  --body-file <ideiglenes fájl>
```

A leírásba sorold fel a benne lévő ticketeket Jira-linkkel, és írd le, mi lett
tesztelve. Ha van Prisma séma változás, emeld ki külön, mert a Render a deploykor
`prisma migrate deploy`-t futtat az éles adatbázison.

A `main` merge után a ticket megy „Kész”-be (`references/jira.md`).
