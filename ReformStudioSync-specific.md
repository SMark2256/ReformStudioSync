# ReformStudio — Részletes AI Agent Fejlesztési Specifikáció & Architektúra Terv

> **Figyelem az AI Agent/Fejlesztő számára:** Ez a dokumentum a **ReformStudio** stúdiókezelő rendszer teljes megvalósítási tervét tartalmazza. A rendszer jelenleg **egyetlen fitneszstúdióra (Single-Tenant)** fókuszál[cite: 2], 0 Ft-os havi fix infrastruktúra-költséggel, ugyanakkor a kódstruktúra és az adatbázis-séma tisztán moduláris, így a későbbiekben opcióként könnyedén kiterjeszthető többstúdiós (SaaS) modellé[cite: 3].

---

## 1. Projekt Áttekintés & Fő Célok

* **Rendszer típusa:** Dedikált egystúdiós webalkalmazás, valós idejű funkciókkal[cite: 1, 2].
* **Fő komponensek:**
    1. **Recepciós Felület (Admin & Operáció):** Vendégkezelés, bérletértékesítés, vonalkódos beléptetés, alkalomlevonások és napi pénzügyi kimutatások rögzítése[cite: 1, 2].
    2. **Vendégmonitor (Másodlagos kijelző):** A pult felé néző ügyfélkijelző, amely vonalkód-beolvasáskor Socket.io kapcsolaton keresztül, ezredmásodperces pontossággal (valós időben) jelzi ki a vendég státuszát és hátralévő alkalmait[cite: 1, 2].
* **Infrastruktúra célösszeg:** **0 Ft / hó** (ingyenes tier alapú felhőszolgáltatásokkal).
* **Főbb elvek:** SOLID architektúra, szigorú TypeScript típusbiztonság, atomi tranzakciókezelés a hibás bérletlevonások elkerülésére.

---

## 2. Technológiai Stack & Felhő Infrastruktúra

### 2.1. Frontend
* **Keretrendszer:** React 18+ (TypeScript) + Vite
* **UI & Stílus:** Tailwind CSS + Shadcn/ui komponensek
* **Állapotkezelés & Adatkezelés:**
    * TanStack Query (React Query v5) – szerveroldali adatok cache-eléséhez és szinkronizálásához
    * Zustand – globális kliensoldali állapotokhoz[cite: 1]
    * Socket.io Client – a valós idejű vendégmonitor kommunikációhoz[cite: 1]
* **Hosting:** Vercel vagy Netlify (Free Tier)[cite: 1]

### 2.2. Backend
* **Keretrendszer:** Node.js + NestJS (TypeScript, moduláris felépítés, DTO validáció)[cite: 1]
* **ORM:** Prisma ORM[cite: 1]
* **Valós idejű réteg:** NestJS WebSocket Gateway (Socket.io)[cite: 1, 2]
* **Hosting:** Render.com (Hobby Tier)[cite: 1]
    * *Megjegyzés az elalvás ellen:* A Render Hobby csomag 15 perc inaktivitás után leáll (*spin down*). Ezt egy külső ingyenes **UptimeRobot** monitor oldja meg, amely 5 percenként HTTP GET kérést küld a backend `/health` végpontjára, így a szerver folyamatosan ébren marad[cite: 1].

### 2.3. Adatbázis
* **Adatbázis motor:** Managed PostgreSQL (Supabase Free Tier)[cite: 1]
* **Tranzakciókezelés:** Prisma `$transaction` az adatintegritás és a versenyhelyzetek (*race conditions*) kizárására[cite: 1].

---

## 3. Rendszerarchitektúra & Hálózati Adatfolyam

1. **Beolvasás:** A recepciós vonalkódot olvas be a recepciós felületen[cite: 1].
2. **REST API kérés:** A backend fogadja a kérést DTO validációval[cite: 1].
3. **Prisma Tranzakció:** Ellenőrzi a bérlet érvényességét, levon 1 alkalmat (ha alkalom alapú), és rögzíti a naplót[cite: 1].
4. **WebSocket Push:** Sikeres tranzakció esetén a NestJS Socket.io Gateway azonnal üzenetet küld a vendégmonitornak[cite: 1, 2].

---

## 4. Prisma Adatbázis Séma (`schema.prisma`)

*(A séma úgy van felépítve, hogy a jövőben minimális módosítással – pl. `tenant_id` mezők hozzáadásával – kiterjeszthető legyen multi-tenant SaaS rendszerré)[cite: 3].*

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum Role {
  ADMIN
  RECEPTIONIST
}

enum PassType {
  OCCASION_BASED // Alkalom alapú bérlet
  TIME_BASED     // Időtartam alapú (pl. havi korlátlan)
}

enum PaymentMethod {
  CASH
  POS_CARD
  BANK_TRANSFER
}

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String
  name      String
  role      Role     @default(RECEPTIONIST)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  checkIns LoggedCheckIn[]

  @@map("users")
}

model Guest {
  id          String   @id @default(uuid())
  barcode     String   @unique
  firstName   String   @map("first_name")
  lastName    String   @map("last_name")
  email       String?  @unique
  phone       String?
  notes       String?
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  passes   GuestPass[]
  checkIns LoggedCheckIn[]

  @@map("guests")
}

model PassTemplate {
  id           String   @id @default(uuid())
  name         String
  type         PassType
  totalPasses  Int?     @map("total_passes")
  durationDays Int?     @map("duration_days")
  price        Decimal  @db.Decimal(10, 2)
  isActive     Boolean  @default(true) @map("is_active")
  createdAt    DateTime @default(now()) @map("created_at")

  purchasedPasses GuestPass[]

  @@map("pass_templates")
}

model GuestPass {
  id              String       @id @default(uuid())
  guestId         String       @map("guest_id")
  passTemplateId  String       @map("pass_template_id")
  type            PassType
  totalPasses     Int?         @map("total_passes")
  remainingPasses Int?         @map("remaining_passes")
  startDate       DateTime     @map("start_date")
  expirationDate  DateTime     @map("expiration_date")
  isActive        Boolean      @default(true) @map("is_active")
  createdAt       DateTime     @default(now()) @map("created_at")

  guest        Guest        @relation(fields: [guestId], references: [id], onDelete: Cascade)
  passTemplate PassTemplate @relation(fields: [passTemplateId], references: [id])
  usageLogs    PassUsageLog[]
  payments     Payment[]

  @@map("guest_passes")
}

model LoggedCheckIn {
  id        String   @id @default(uuid())
  guestId   String   @map("guest_id")
  userId    String   @map("user_id")
  createdAt DateTime @default(now()) @map("created_at")

  guest Guest @relation(fields: [guestId], references: [id])
  user  User  @relation(fields: [userId], references: [id])

  @@map("logged_check_ins")
}

model PassUsageLog {
  id          String   @id @default(uuid())
  guestPassId String   @map("guest_pass_id")
  usedAt      DateTime @default(now()) @map("used_at")
  note        String?

  guestPass GuestPass @relation(fields: [guestPassId], references: [id], onDelete: Cascade)

  @@map("pass_usage_logs")
}

model Payment {
  id            String        @id @default(uuid())
  guestPassId   String?       @map("guest_pass_id")
  amount        Decimal       @db.Decimal(10, 2)
  paymentMethod PaymentMethod @map("payment_method")
  createdAt     DateTime      @default(now()) @map("created_at")

  guestPass GuestPass? @relation(fields: [guestPassId], references: [id], onDelete: SetNull)

  @@map("payments")
}
```

# 5. Üzleti Logika & Tranzakciókezelés Példa

* A beléptetéskor az alábbi atomi tranzakció fut le a NestJS backendben (megakadályozva a negatív egyenlegeket és a duplikált levonásokat)

```
import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MonitorGateway } from '../websocket/monitor.gateway';

@Injectable()
export class CheckInService {
  constructor(
    private prisma: PrismaService,
    private monitorGateway: MonitorGateway,
  ) {}

  async processBarcodeCheckIn(barcode: string, staffUserId: string) {
    return await this.prisma.$transaction(async (tx) => {
      const guest = await tx.guest.findUnique({
        where: { barcode },
        include: {
          passes: {
            where: {
              isActive: true,
              expirationDate: { gte: new Date() },
            },
          },
        },
      });

      if (!guest) {
        throw new BadRequestException('A vendég nem található ezzel a vonalkóddal.');
      }

      const activePass = guest.passes.find((p) => {
        if (p.type === 'TIME_BASED') return true;
        return p.type === 'OCCASION_BASED' && p.remainingPasses && p.remainingPasses > 0;
      });

      if (!activePass) {
        this.monitorGateway.emitCheckInResult({
          status: 'DENIED',
          guestName: `${guest.lastName} ${guest.firstName}`,
          reason: 'Nincs érvényes bérlet!',
        });
        throw new BadRequestException('Nincs érvényes bérlet.');
      }

      if (activePass.type === 'OCCASION_BASED') {
        await tx.guestPass.update({
          where: { id: activePass.id },
          data: {
            remainingPasses: { decrement: 1 },
            isActive: (activePass.remainingPasses ?? 0) - 1 > 0,
          },
        });

        await tx.passUsageLog.create({
          data: {
            guestPassId: activePass.id,
            note: 'Vonalkódos beléptetés',
          },
        });
      }

      await tx.loggedCheckIn.create({
        data: {
          guestId: guest.id,
          userId: staffUserId,
        },
      });

      const responseData = {
        status: 'SUCCESS',
        guestName: `${guest.lastName} ${guest.firstName}`,
        remainingPasses:
          activePass.type === 'OCCASION_BASED'
            ? (activePass.remainingPasses ?? 1) - 1
            : 'Korlátlan',
        expirationDate: activePass.expirationDate,
      };

      this.monitorGateway.emitCheckInResult(responseData);
      return responseData;
    });
  }
}
```

# 6. Fejlesztési Roadmap (Lépésről Lépésre)

* Fázis 1 – Alapok & Adatbázis: NestJS projekt inicializálása, Supabase PostgreSQL kapcsolat beállítása a Prisma ORM-mel.
* Fázis 2 – Backend Modulok: Autentikáció (JWT), vendégkezelés, bérletkezelés és DTO alapú validációk.
* Fázis 3 – Valós Idejű Réteg: Socket.io WebSocket Gateway beállítása a monitor oldali kommunikációhoz.
* Fázis 4 – Beléptetési Logika: Tranzakcióbiztos alkalomlevonás implementálása.
* Fázis 5 – Frontend Fejlesztés: React + Vite felület felépítése Tailwind CSS-sel, Shadcn/ui elemekkel, TanStack Query-vel és Zustanddal.
* Fázis 6 – Deployment & Monitor: Backend telepítése Renderre, Frontend Vercelre, valamint az UptimeRobot ping beállítása.
