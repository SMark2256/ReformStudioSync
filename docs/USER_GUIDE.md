# ReformStudioSync — Felhasználói Kézikönyv (Recepció & Admin)

Ez a kézikönyv a **ReformStudioSync** napi szintű, egyszerű és gyors használatát mutatja be a recepciós munkatársak és a stúdióvezető számára.

---

## 1. Napi Nyitási Rutin (1 perc)

1. Nyisd meg a böngészőben a recepciós felületet (`/login` vagy `/reception`), és jelentkezz be.
2. Kattints a jobb felső sarokban található **"Vendégmonitor"** gombra:
   - Ha a recepciós gépre kötött második monitort használod, húzd át rá a megnyíló ablakot és nyomj **"Teljes Képernyő"** gombot.
   - Ha külön Tabletet használsz a pulton, ellenőrizd a fejlécben az **`Online (X kijelző)`** zöld visszajelzőt.

---

## 2. Vendég Beléptetése (Vonalkóddal, Digitális Kártyával vagy Név szerint)

### 2.1. Beléptetés Vonalkódolvasóval
- Egyszerűen csippantsd le a vendég műanyag kártyáját vagy a telefonján felmutatott **Digitális Belépőkártyát**.
- **Fontos:** Nem kell előtte a keresőmezőbe kattintanod! A rendszer bárhol érzékeli a vonalkódolvasó jelét.

### 2.2. Mit jelentenek a színek, hangok és a felugró (Toast) üzenetek?

- **ZÖLD (Sikeres beléptetés + magas hangjelzés):**
  - A vendégnek érvényes bérlete van, 1 alkalom automatikusan levonásra került (havi korlátlan bérletnél nem fogy alkalom).
  - A Vendégmonitoron 7 másodpercig megjelenik a vendég neve, a maradék alkalmak száma és a bérlet lejárati dátuma.
- **SÁRGA (Figyelmeztetés + dupla hangjelzés):**
  - **Utolsó alkalom / Hamarosan lejár:** A vendég az utolsó (vagy utolsó előtti) alkalmát használta fel, vagy a bérlete 3 napon belül lejár. A felugró üzenetben és a kártyán azonnal megjelenik a **"Bérlet Megújítása 1 Kattintással"** gomb!
  - **Dupla leolvasás védelem (10 másodpercen belül):** Ha véletlenül kétszer húztad le ugyanazt a kártyát 10 másodpercen belül, a rendszer **nem von le** újabb alkalmat. Ha a vendég szándékosan egy barátját is a saját bérletére szeretné beléptetni, kattints a **"Mégis levonás (+1 vendég)"** gombra.
- **PIROS (Elutasított belépés + mély figyelmeztető hang):**
  - A vendég bérlete lejárt, elfogytak az alkalmai, vagy a bérlete jelenleg **fagyasztva van**.
  - Kattints a felugró üzenetben a **"Bérlet eladása most"** gombra az azonnali értékesítéshez.

### 2.3. Beléptetés, ha a vendég otthon hagyta a kártyáját
1. A Recepciós Pult alsó részén a **"Vendég Gyorskereső"** mezőbe írd be a vendég nevét vagy telefonszámát.
2. A találati sorban kattints a zöld **"Beléptetés"** gombra.

### 2.4. Téves Lehúzás Javítása (1-Kattintásos Sztornó)
Ha véletlenül rossz kártyát csippantottál le:
- Kattints közvetlenül a jobb alsó sarokban felugró zöld értesítésen a **"Sztornó (Visszavonás)"** gombra, **VAGY**
- Kattints az *"Utolsó Beléptetés Állapota"* kártyán / a *"Mai Beléptetési Napló"* listában a **"Sztornó"** gombra.
- A rendszer azonnal visszaírja a levont `+1` alkalmat a vendég bérletére, és erről a Vendégmonitoron is visszajelzést ad.

---

## 3. Új Vendég Felvétele, Digitális Kártya és Bérletértékesítés

### 3.1. Új Vendég Regisztrálása és Digitális Kártya
1. Kattints az **"+ Új Vendég"** gombra, és töltsd ki a nevet, telefonszámot, e-mail címet.
2. **Vonalkód mező:**
   - Ha fizikai kártyát adsz át, kattints a Vonalkód mezőbe és csippantsd le az új kártyát.
   - Ha nem használtok műanyag kártyát, hagyd üresen a mezőt: a rendszer automatikusan generál egy egyedi kódot.
3. Mentés után kattints a vendég mellett a **"Digitális Kártya" (QR ikon)** gombra, majd a **"Kártya Letöltése (PNG)"** gombra. A letöltött képet átküldheted a vendégnek, aki a telefonjáról mindig be tudja mutatni.

### 3.2. Bérlet Eladása
1. Kattints a vendég sorában a **"Bérlet Eladás"** (vagy beléptetés után a **"Bérlet Megújítása 1 Kattintással"**) gombra.
2. Válaszd ki a bérlettípust (pl. *1 Alkalmas Napijegy*, *5 Alkalmas*, *10 Alkalmas*, *Havi Korlátlan*).
3. Válaszd ki a fizetési módot: **Bankkártya (POS)**, **Készpénz** vagy **Átutalás**.
4. Kattints a **"Bérlet Eladása & Fizetés"** gombra. A rendszer zöld Toast üzenettel visszaigazolja a rögzítést, a bérlet azonnal aktívvá válik, az összeg pedig bekerül a napi kasszába.

---

## 4. Napi Kasszazárás és Pénzügyi Sztornó

1. Válts a felső menüben a **"Napi Kassza"** fülre.
2. Itt láthatod a napi összbevételt, valamint külön bontva a **Készpénz**, **Bankkártya (POS)** és **Átutalás** egyenlegeket.
3. **Téves eladás sztornózása:** Ha véletlenül rossz bérletet vagy rossz fizetési módot rögzítettél, kattints az adott sor végén a **"Fizetés Sztornó"** gombra. Ez levonja az összeget a napi kasszából és inaktiválja a tévesen kiadott bérletet.

---

## 5. Adminisztrátori Funkciók (Hosszabbítás, Fagyasztás, Sablonok)

### 5.1. Bérlet Hosszabbítása (`+7`, `+14`, `+30` nap) és Fagyasztása
1. Nyisd meg a **"Vendégkartoték"** fület, és kattints a vendég sorában a **"Kartoték & Hosszabbítás"** gombra.
2. A bérlet kártyáján:
   - Kattints a **`+7 nap`**, **`+14 nap`** vagy **`+30 nap`** gombra a lejárati idő meghosszabbításához.
   - Tartós betegség vagy utazás esetén kattints a **"Fagyasztás"** gombra. Amikor a vendég visszatér, kattints a **"Feloldás (+napok jóváírása)"** gombra: a rendszer automatikusan hozzáadja a szüneteltetett napokat a bérlet lejáratához!

---

## 6. Gyakori Kérdések & Hibaelhárítás a Pultban (GYIK)

- **Mi történik, ha elmegy az internet a stúdióban?**
  - A rendszer automatikusan **Offline Puffer** módba vált (sárga jelzés a felső sávban). Nyugodtan csippantsd le a kártyákat: a rendszer elmenti őket, és amint visszatér az internet, automatikusan szinkronizálja az összes belépést.
- **Hol tudom kockázat nélkül gyakorolni a rendszer használatát?**
  - Kattints a jobb felső sarokban a **"Demo Oldal" (`/demo`)** gombra! Itt tesztvendégekkel és virtuális vonalkódolvasóval bármit kipróbálhatsz anélkül, hogy az éles adatokat módosítanád.
- **Hol látom, mi változott a legutóbbi frissítésben?**
  - Kattints a felső sávban az **"Újdonságok"** fülre (piros szám jelzi a még nem látott újdonságokat). Ha egy új funkció vagy oldal megtekinthető, a kártyán lévő gomb egyből oda visz; a kisebb fejlesztéseknél csak rövid leírás van.
- **Hogyan válthatok Sötét Módra (Dark Mode) a recepciós pultnál?**
  - Kattints a felső navigációs sávban található **"Sötét mód / Világos mód"** (Hold / Nap ikon) gombra. A beállítást a böngésző megjegyzi, miközben a **Vendégmonitor (`/monitor`)** képernyője változatlan marad.
