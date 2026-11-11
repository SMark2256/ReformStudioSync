# Terv — 2026-11-11 (kódos belépés SendPulse-szal)

Állapot: Folyamatban (jóváhagyva 2026-11-11)

A belépés a tinati mintájára e-mailben küldött, egyszer használatos 6 jegyű kódra áll át (tinati: `src/client/pages/login/ui/login-page.tsx`, `src/server/routes/auth.ts`, `src/shared/schemas/auth.ts`). A tinati a Supabase Auth OTP-jét használja Resend SMTP-vel; nálunk nincs Supabase Auth, ezért a kódot az API maga állítja elő és tárolja, a levelet a **SendPulse** REST API küldi. A munkamenet a mostani JWT marad.

SendPulse hozzáférés (2026-11-11): az API kulcs a `C:\Users\cort2\.secrets\reformstudiosync\sendpulse_api_key` fájlban van, a `SENDPULSE_API_KEY_FILE` felhasználói változó mutat rá; a SendPulse MCP (`https://mcp.sendpulse.com/mcp`) felhasználói szinten be van kötve. A fiók állapota: SMTP csomag „Smtp Test” (50 levél maradt, óránként 10), egyetlen feladó `devtest@sendpulseemail.com`, saját küldő domain nincs.

## Jegyek
| Jira | Cím | Típus | Méret | Függ |
| --- | --- | --- | --- | --- |
| TICKET-35 | Belépés e-mailben küldött kóddal (SendPulse) | IMPROVEMENT | M | – |

Jira: https://reformstudiosync.atlassian.net/browse/TICKET-35

## Worker bontás
- Worker A (egyedül): TICKET-35 — ág: TICKET-35, `origin/demo`-ról. Érintett:
  - `apps/api/prisma/schema.prisma` + új migráció (`LoginCode` modell; `User.passwordHash` opcionális lesz)
  - `apps/api/src/modules/auth` (`auth.controller.ts`, `auth.dto.ts`, `auth.service.ts`, új `login-code.service.ts`)
  - új `apps/api/src/modules/mail` (`MailService`, SendPulse kliens)
  - `apps/api/src/config/env.validation.ts`, `apps/api/.env.example`, `render.yaml`
  - `apps/api/prisma/seed.ts` (jelszó nélküli munkatársak, lásd lent)
  - `packages/shared` (új DTO-k és hibakódok: `AUTH.CODE_INVALID`, `AUTH.CODE_RATE_LIMITED`, `AUTH.MAIL_UNAVAILABLE`)
  - `apps/web/src/pages/login`, `apps/web/src/shared/api/client.ts`, munkatárs-létrehozó űrlap (jelszómező ki)
  - E2E belépés (`e2e/`), `apps/web/src/pages/reception/model/releaseNotes.ts`

### Részletek a workernek

**API**
- `POST /auth/code` `{ email }`: csak aktív, létező munkatársnak megy kód. Ismeretlen címre is ugyanazt az „elküldtük” választ adja (ne lehessen végigpróbálni, kik a munkatársak), csak levél nem megy ki.
- Kód: 6 számjegy (`crypto.randomInt`), 10 percig érvényes. Az adatbázisban csak a hash-e van (HMAC-SHA256 a `JWT_SECRET`-tel). Új kód kérése a korábbit érvényteleníti. Ugyanarra a címre legfeljebb 60 mp-enként és óránként 5 kód.
- `POST /auth/verify` `{ email, code }`: helyes kódra a mostani `LoginResponseDto`-t adja (JWT + user), a kódot felhasználtnak jelöli. Kódonként legfeljebb 5 próbálkozás, utána a kód elvész. Hibás vagy lejárt kódra 400 + `AUTH.CODE_INVALID`.
- A régi `POST /auth/login` (jelszó) megszűnik.
- `MailService` → SendPulse: `POST https://api.sendpulse.com/smtp/emails`, `Authorization: Bearer <SENDPULSE_API_KEY>`, törzs `{ email: { subject, html (Base64), text, from: { name, email }, to: [{ email, name }] } }`, 15 mp időkorlát. Naplóba csak a HTTP státusz kerül, a válasz törzse nem (személyes adatot tartalmazhat). Hibánál 502 + `AUTH.MAIL_UNAVAILABLE`.
- Levél: tárgy „123456 – ReformStudio Sync belépőkód” (a kód elöl, hogy az értesítésben és a telefon kód-kitöltésében is látsszon). HTML sablon: [`2026-11-11-kodos-belepes-email.html`](2026-11-11-kodos-belepes-email.html) — ezt kell átvenni (pl. `apps/api/src/modules/mail/templates/login-code.ts` függvényként, a helyőrzők: `{{CODE}}`, `{{NAME}}` = keresztnév, `{{TTL_MINUTES}}`, `{{REQUESTED_AT}}` = budapesti idő, „2026. november 11., 16:42”). A beillesztett értékeket HTML-escape-elni kell. Mellé szöveges változat ugyanezzel a tartalommal.
- Munkamenet: marad a mostani 14 órás JWT (`expiresIn: '14h'`), ehhez nem kell nyúlni.
- Új env: `SENDPULSE_API_KEY`, `MAIL_FROM_EMAIL` (egyelőre `devtest@sendpulseemail.com`, a SendPulse teszt feladója), `MAIL_FROM_NAME` (alap „ReformStudio Sync”). Ha a kulcs nincs beállítva és `NODE_ENV !== 'production'`, a kód a szerver naplójába kerül levél helyett (helyi fejlesztés). Productionben a hiányzó kulcs indítási hiba.
- E2E/CI: `AUTH_FIXED_LOGIN_CODE` env, csak `NODE_ENV !== 'production'` mellett fogadja el (a tesztek ezzel lépnek be, levél nélkül).

**Munkatársak (Megrendelő, 2026-11-11)**
- Kezdésnek két munkatárs van az adatbázisban: `smark.siklodi@gmail.com` (Siklódi Márk, ADMIN) és `b.siklodi@mediajam.hu` (Siklódi Brigi, ADMIN). A seed ezeket hozza létre / frissíti, jelszó nélkül.
- A régi seed munkatársak (`admin@reformstudio.hu`, `recepcio@reformstudio.hu`) a seedből kikerülnek. A meglévő adatbázisokban (demo, éles) nem töröljük őket, mert befizetések, belépések hivatkoznak rájuk, hanem a migráció / seed `isActive = false`-ra állítja őket, így kódot sem kaphatnak.
- Az E2E saját tesztmunkatársat használ (pl. `e2e@reformstudio.test`), a rögzített tesztkóddal.

**Web (tinati `login-page.tsx` mintájára)**
- Két lépés egy kártyán: **E-mail** („Kód küldése”) → **Kód** (`inputMode="numeric"`, `autoComplete="one-time-code"`, 6 karakter, nagyobb, ritkított számjegyek). Leírás: „Elküldtük a belépőkódot ide: **cím**. A kód 10 percig érvényes.”
- A kódlépésen: „Belépés”, „Új kód kérése” (siker után: „Új kódot küldtünk. A korábbi kód már nem érvényes.”), „Másik e-mail cím”. Töltés közbeni feliratok: „Küldés...”, „Ellenőrzés...”. Hibák a szerver üzenetével, `role="alert"`.
- Az előre kitöltött demo e-mail/jelszó megszűnik. A fejléc (RS jel, verzió, témaváltó) marad. Világos és sötét téma, `reformstudio-ui-skill`.
- Munkatárs létrehozása: a jelszómező kikerül, csak név, e-mail, szerepkör.

**Szabályok**: FSD rétegek, magyar szöveg, helyi gate/teszt nincs (a CI ellenőriz), commit után jelentés.

## Elfogadási feltételek
- Létező munkatárs e-mail címére 1 percen belül megérkezik a kód a SendPulse-on át, és vele be lehet lépni.
- Hibás kódra érthető hiba; 5 hibás próbálkozás után a kód nem használható; lejárt kódra hiba; új kód kérése után a régi nem működik.
- Ismeretlen címre ugyanaz a válasz, levél nem megy ki.
- A levél a sablon szerint néz ki (Gmailben világos és sötét módban is olvasható), a tárgyban a kód.
- Jelszavas belépés nincs többé; új munkatárs jelszó nélkül jön létre és kóddal belép.
- A belépőoldal világos/sötét témában, 375 / 1024 / 1440 px-en rendben (skill 10.4).
- CI (gate + E2E) zöld.

## Újdonságok bejegyzések
- TICKET-35 → IMPROVEMENT, link nélkül: „Jelszó helyett e-mailben kapott belépőkóddal lehet belépni.”

## Kiadás
- Render (`reform-studio-api`): `SENDPULSE_API_KEY`, `MAIL_FROM_EMAIL`, `MAIL_FROM_NAME` beállítása a demo PR előtt (Render MCP-vel).

## Döntések (Megrendelő, 2026-11-11)
- Munkatársak: Siklódi Márk (`smark.siklodi@gmail.com`) és Siklódi Brigi (`b.siklodi@mediajam.hu`), mindketten ADMIN.
- Feladó: egyelőre, tesztjelleggel a `devtest@sendpulseemail.com`. Saját domain és SMTP aktiválás később, külön.
- A jelszó teljesen kikerül (nincs tartalék jelszavas belépés).
- Levélsablon a tervhez csatolva, a tárgyban benne a kód. A sablon a kódban él (verziókövetve), SendPulse-sablonként nem kell feltölteni.
- A munkamenet marad 14 óra (a Megrendelő a 1 napot visszavonta).
