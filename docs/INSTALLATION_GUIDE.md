# ReformStudioSync — Telepítési és Üzemeltetési Útmutató

Ez az útmutató lépésről lépésre bemutatja a **ReformStudioSync** rendszer lokális elindítását, a **0 Ft / hó** felhő-infrastruktúra (Supabase + Render + Vercel + UptimeRobot) beállítását, valamint a recepciós hardverek (vonalkódolvasó, másodlagos monitor, tablet) beüzemelését.

---

## 1. Előfeltételek

- **Node.js:** v20 LTS vagy v22+
- **Csomagkezelő:** `npm` (v10+) vagy `pnpm` (v9+)
- **PostgreSQL adatbázis:** Helyi PostgreSQL példány vagy ingyenes **Supabase** projekt (megjegyzés: a frontend `/demo` és `/reception` felülete adatbázis nélkül is azonnal kipróbálható a beépített kliensoldali Mock Sandbox motorral!).

---

## 2. Lokális Fejlesztői Környezet Indítása

### 2.1. Függőségek telepítése és közös típusok fordítása

A projekt gyökérkönyvtárában (`ReformStudioSync/`) futtasd:

```bash
npm install
npm run build:shared
```

### 2.2. Környezeti változók (`.env`) beállítása

1. Másold le a backend sablont:
   ```bash
   cp apps/api/.env.example apps/api/.env
   ```
   Állítsd be benne a `DATABASE_URL`, `DIRECT_URL` és `JWT_SECRET` értékeket.
2. Másold le a frontend sablont:
   ```bash
   cp apps/web/.env.example apps/web/.env
   ```

### 2.3. Adatbázis séma szinkronizálása és kezdeti adatok (Seed) betöltése

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

A `db:seed` parancs létrehozza az alapértelmezett fiókokat és bérletsablonokat:
- **Adminisztrátor:** `admin@reformstudio.hu` / `Admin123!`
- **Recepciós:** `recepcio@reformstudio.hu` / `Recepcio123!`

### 2.4. Alkalmazások indítása

- **Backend indítása (`http://localhost:3001/api`, Swagger: `http://localhost:3001/api/docs`):**
  ```bash
  npm run dev:api
  ```
- **Frontend indítása (`http://localhost:5173`):**
  ```bash
  npm run dev:web
  ```

---

## 3. Nullforintos (0 Ft / hó) Felhő Infrastruktúra Beállítása

### 3.1. Supabase (PostgreSQL Free Tier)
1. Hozz létre egy új projektet a [supabase.com](https://supabase.com) felületén (EU Central régió ajánlott).
2. A **Project Settings -> Database -> Connection string** menüben másold ki a két URL-t:
   - **Transaction Pooler (Port `6543`):** Ez lesz a `DATABASE_URL` (adj hozzá `?pgbouncer=true&connection_limit=5` paramétert).
   - **Session / Direct Connection (Port `5432`):** Ez lesz a `DIRECT_URL` (a Prisma migrációkhoz).

### 3.2. Render.com (NestJS Backend + Socket.io — Hobby Free Tier)
1. Kösse össze a GitHub repository-t a [render.com](https://render.com) szolgáltatással (**New -> Web Service** vagy **Blueprint** a gyökérben található `render.yaml` alapján).
2. Ha manuálisan állítod be:
   - **Build Command:** `npm install && npm run build:shared && npm --workspace=@reform/api run prisma:generate && npm --workspace=@reform/api run build`
   - **Start Command:** `npm --workspace=@reform/api run start:prod`
3. Állítsd be az Environment Variables értékeket (`DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `CORS_ORIGIN`).

### 3.3. Cloudflare Workers (React + Vite Frontend — Free Tier)
A frontend statikus SPA-ként fut Cloudflare Workers Static Assets-en (`apps/web/wrangler.jsonc`, SPA fallbackkel a react-routerhez).

1. **Manuális deploy a gyökérből:**
   ```bash
   npx -w @reform/web wrangler login   # egyszer, böngészős jóváhagyás
   VITE_API_URL="https://<render-app-neve>.onrender.com/api" \
   VITE_WS_URL="https://<render-app-neve>.onrender.com" \
   npm run deploy:web
   ```
   A `VITE_*` változók **build időben** kerülnek a bundle-be, ezért a build előtt kell megadni őket (vagy `apps/web/.env.production` fájlban).
2. **Vagy Git-alapú automatikus deploy** (Cloudflare Dashboard → Workers & Pages → Create → Import a repository):
   - **Root directory:** `/` (repo gyökér)
   - **Build command:** `npm run build:web`
   - **Deploy command:** `npm --workspace=@reform/web run deploy`
   - **Build variables:** `VITE_API_URL`, `VITE_WS_URL` (lásd fent)
3. A kapott `https://reformstudiosync.<fiók>.workers.dev` címet add meg a Renderen a `CORS_ORIGIN` értékeként.

### 3.4. UptimeRobot (Render Spin-Down & Supabase Pause Megelőzése)
1. Regisztrálj egy ingyenes fiókot az [uptimerobot.com](https://uptimerobot.com) oldalon.
2. Hozz létre egy új **HTTP(s)** monitort:
   - **URL:** `https://<render-app-neve>.onrender.com/api/health`
   - **Monitoring Interval:** `5 minutes`
3. A `/api/health` végpont minden 5. percben ébren tartja a Render konténert, és 30 percenként automatikusan lefuttat egy `SELECT 1` lekérdezést a Supabase adatbázison is.

---

## 4. Recepciós Hardverek Beüzemelése

### 4.1. Fizikai USB / Bluetooth Vonalkódolvasó
- Az olvasónak **HID Keyboard Emulation** (billentyűzet emuláció) módban kell működnie, **Enter (`CR`)** lezáró karakterrel.
- A rendszer `useBarcodeScanner` hookja automatikusan érzékeli a `< 45 ms` sebességű karakterbevitelt, így **nem szükséges a keresőmezőbe kattintani** a kártya lehúzásához.

### 4.2. Vendégmonitor — Másodlagos Monitor (Azonos PC)
1. Csatlakoztasd a másodlagos monitort a recepciós PC-re **Kiterjesztett asztal (`Extend these displays`)** módban.
2. A Recepciós Pult jobb felső sarkában kattints a **"Vendégmonitor"** gombra.
3. Húzd át a megnyílt ablakot a vendég felé néző monitorra, és kattints a **"Teljes Képernyő"** gombra (vagy nyomj `F11`-et).

### 4.3. Vendégmonitor — Önálló Tablet / iPad / Smart TV
1. A Recepciós Pult **"Sablonok & Monitorok"** fülén adj nevet az eszköznek (pl. *Pult Tablet*), majd kattints a **"Párosító Kód Generálása"** gombra.
2. A tableten nyisd meg a `https://<domain>/monitor` oldalt, kattints a **"Tablet Párosító Kód"** gombra, és írd be a 6 jegyű számot.
3. Kattints a **"Teljes Képernyő"** gombra (a beépített `Screen Wake Lock` megakadályozza, hogy a tablet kijelzője elaludjon).
