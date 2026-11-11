# ReformStudioSync — Kiadási jegyzék

A verziók a legújabbtól a legrégebbiig. A `demo` ágon gyűlő változások a következő verzió alá kerülnek, és a `main`-re kerüléskor válnak kiadássá (Git tag + GitHub Release). Az alkalmazáson belüli Újdonságok menü forrása: `apps/web/src/pages/reception/model/releaseNotes.ts`.

## v0.3 — a `demo`-n, a következő `main` kiadással élesedik

### Új funkciók és oldalak
- **Belépés e-mailben kapott kóddal:** jelszó helyett a megadott e-mail címre érkező 6 jegyű kóddal lehet belépni; a kód 10 percig érvényes, és csak egyszer használható. (TICKET-35)
- **Új oldalsáv és Beállítások:** sötét, lebegő bal oldali menü; a nevedre kattintva felcsúszó panelből éred el a Beállításokat, a téma kapcsolót és a kijelentkezést. A téma mellett a felület színe is választható. (TICKET-28)
- **Monitorok oldal:** a vendégmonitorok és tabletek kezelése saját oldalt kapott, a profilpanelből érhető el. (TICKET-38)
- **Születésnapi köszöntés:** a születésnapos vendéget konfetti köszönti a Vendégmonitoron. (TICKET-36)
- **Vendég neme, női köredzés:** új vendég felvételekor a nem kötelező, a keresztnévből előtöltve (a meglévő vendégeknél a keresztnév alapján kitöltve). A csak nőknek szóló szolgáltatás (női köredzés) bérlete és tagsága férfi vendégnek nem adható el, és vele nem léptethető be; „nincs megadva” nemnél figyelmeztetés. Új szolgáltatásnál „Csak nőknek” jelölő. (TICKET-42)

### Fejlesztések
- **Új navigáció:** a felső fülsor helyett bal oldali menü (Recepció, Vendégek, Bérletek és termékek, Pénzügy); minden résznek saját címe van, könyvjelzőzhető, és frissítés után ugyanott maradsz. (TICKET-21)
- **Megújult felület:** egységes kártyák, táblázatok, gombok és ablakok világos és sötét témában.
  - Recepció: felül gyorsműveletek és napi összesítő, alatta beolvasás, utoljára azonosított vendég, vendégkereső, mai kassza és mai érkezések. (TICKET-22)
  - Vendégek: áttekinthető táblázat (kártyaszám, név, telefon, bérlet, fennmaradó alkalmak, lejárat, állapot), soronként nyíló adatlap. (TICKET-23)
  - Pénzügy, Bérletek és termékek, Újdonságok, bejelentkezés és demó. (TICKET-24)
- **Belépések a vendégadatlapon:** új „Belépések” fül (időpont, köredzés vagy kezelés, bérlet, rögzítő, állapot: sikeres / sztornózott / elutasított az okkal); a Bérletek fülön bérletenként is. (TICKET-40)
- **Szűrhető Újdonságok:** típus szerinti szűrés, kártyánként nyitható részletek. (TICKET-37)
- **Egységes hibaüzenetek:** minden hiba egyformán jelenik meg; lejárt bejelentkezésnél automatikusan a belépőoldalra visz. (TICKET-9)

### Javítások
- **Beolvasás alkalmas bérlettel:** ha a vendégnek csak alkalmas bérlete van, a csippantás után a kezelésválasztó ablak nyílik meg (előre kitöltve), és a levonás a megerősítéskor történik; nincs több ingyenes köredzés-belépés kezelésbérlettel. (TICKET-39)
- **Bérletfagyasztás:** feloldáskor naptári napok szerint hosszabbodik a lejárat; csak érvényes bérlet fagyasztható; az előzményekben látszik, ki fagyasztott vagy oldott fel. (TICKET-41)
- **Szolgáltatáshoz illő üdvözlés:** a Vendégmonitor és a recepció a szolgáltatás szerint köszönt (köredzés: „Jó edzést”, kezelés: „Kellemes kezelést”, kozmetika: „Kellemes kikapcsolódást”); „Női Köredzés” csak a csak nőknek szóló köredzésnél. (TICKET-43)
- **Vendégmonitor kapcsolat:**
  - valós kapcsolatállapot a fejlécben; a recepción bontott párosítás után a monitor azonnal a párosító kódot kéri (TICKET-32);
  - a törölt vagy új kódot kapott kijelző azonnal lekapcsolódik (TICKET-31);
  - az „Online (N kijelző)” csak a ténylegesen kapcsolódó monitorokat számolja (TICKET-30);
  - a monitor és a recepció tartósan kapcsolódva marad, az üdvözlés nem vész el (TICKET-29).
- **Adatvédett Vendégmonitor:** soha nem mutat tartozást vagy elutasítási okot. (TICKET-17)
- **Kezeléslevonás:** az „1 Alkalom Levonása & Üdvözlés” jelzi, mi hiányzik (vendég, kezelés, bérlet), és ha még nincs felvett kezelés. (TICKET-27)
- **Befizetés:** bármilyen pozitív, egész forintösszeg rögzíthető (pl. 3 000 Ft), érvénytelen összegnél hibaüzenet. (TICKET-25)
- **Pontos alkalomszám:** a hátralévő alkalmak mindig a ténylegesen levont, vissza nem vont kezelésekből számolódnak, sztornó után is. (TICKET-16)
- **Havi tagdíjak:** minden hónapban automatikusan esedékessé válnak, így a tartozások és a késési kategóriák pontosak. (TICKET-13)

## v0.2 — 2026-10-22

### Új funkciók és oldalak
- **Globális QR-kód és vonalkód olvasó:** a fizikai olvasó (USB / Bluetooth) minden megnyitott oldalon működik (`/reception`, `/monitor`, `/tablet`, `/demo`), fókusztól függetlenül; kereső- vagy űrlapmezőbe nem ír bele véletlenül; a magyar billentyűzetkiosztás miatt eltolt karaktereket javítja, és felismeri az URL-, JSON- és előtagos (`REFORM:100001`, `#100001`) kódokat; a fejlécben egy kattintással szüneteltethető.
- **Kétmódú Vendégmonitor:** a recepciós gép második kijelzőjén párosítás nélkül, önálló tableten / TV-n a recepción generált, 10 percig érvényes 6 jegyű kóddal. Kijelzők elnevezése, átnevezése, új kód, párosítás bontása és Teszt Jel küldése.
- **Köredzés és alkalmas kezelés:** havi tagsággal vagy időalapú bérlettel köredzésnél nincs levonás; alkalmas kezelésnél (pl. Hypoxi, Reformer) külön ablakban választható a kezelés és a bérlet (-1 alkalom), indoklással visszavonható. Az üdvözlés ideje 3–30 mp között állítható.
- **Havi tagságok és pénzügy:** tagságok (aktív, szüneteltetett, megszüntetett) és esedékességek; hátralék-kategóriák (1–5, 6–15, 15+ nap) recepciós figyelmeztetéssel; részbefizetés és célzott befizetés tagdíjhoz vagy bérlethez.
- **Bővített vendégkartoték:** testmérések (súly, testzsír%, izomtömeg, körméretek), automatikus WebP képoptimalizálás a vendégfotókhoz, belső megjegyzések és e-mail napló.
- **Tablet aláíró felület (`/tablet`):** GDPR és állapotfelmérő ívek aláírása.
- **Napi műszerfal:** születés- és névnapos vendégek, lejáró bérletek, szolgáltatás-megoszlás.

### Fejlesztések
- **Dupla csippantás elleni védelem:** a védelmi ablak 60 mp-ről 10 mp-re csökkent, egy kattintással felülbírálható.
- **Sötét téma:** jobb olvashatóság a kártyákon, jelvényeken és gombokon.

## v0.1 — 2026-10-20 (első verzió)

- **Recepció (`/reception`):** beléptetés vonalkóddal, automatikus bérletválasztással (időalapú bérlet, utána a leghamarabb lejáró alkalmas bérlet) és dupla lehúzás elleni védelemmel; visszaigazoló értesítések minden művelethez; egy kattintásos sztornó (beléptetés és fizetés) és bérletmegújítás; offline beolvasási puffer, amely a kapcsolat visszatérésekor automatikusan szinkronizál.
- **Vendégkartoték (`/guests`):** vendégfelvétel, bérlettörténet, felhasználási napló; digitális belépőkártya (Code-128 vonalkód + QR-kód, PNG letöltés és nyomtatás); bérlethosszabbítás (+N nap), fagyasztás és feloldás.
- **Valós idejű Vendégmonitor (`/monitor`):** a recepciós gép második kijelzőjén vagy párosított tableten; a képernyő nem alszik el.
- **Demó (`/demo`):** élő adatbázistól független próbakörnyezet virtuális vonalkódolvasóval és beágyazott monitor-előnézettel.
- **Bejelentkezés és sötét téma.**
