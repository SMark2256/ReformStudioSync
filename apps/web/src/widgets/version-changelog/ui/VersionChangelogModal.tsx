import React from 'react';
import {
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui';

const sectionTitleClassName = 'text-[13px] font-semibold text-foreground';
const listClassName =
  'list-disc space-y-1.5 pl-5 text-[13px] text-muted-foreground [&_strong]:text-foreground';

interface VersionBadgeProps {
  className?: string;
}

// A verziószám a bejelentkezésnél; kattintásra a v0.2 kiadási jegyzéke nyílik.
export const VersionBadge: React.FC<VersionBadgeProps> = ({ className }) => (
  <Dialog>
    <DialogTrigger asChild>
      <Button
        variant="link"
        size="sm"
        className={className}
        aria-label="v0.2 kiadási jegyzék megnyitása"
      >
        v0.2
      </Button>
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>ReformStudioSync v0.2 kiadási jegyzék</DialogTitle>
        <DialogDescription>
          Az előző (v0.1) verzióhoz képest bekerült új funkciók, opciók és
          fejlesztések.
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="space-y-5">
        {/* 1. Globális QR / Vonalkód Szkenner Csatorna */}
        <section className="space-y-2">
          <h3 className={sectionTitleClassName}>
            1. Globális 2D QR-kód és Vonalkód Szkenner Csatorna
          </h3>
          <ul className={listClassName}>
            <li>
              <strong>Oldalaktól és fókusztól független olvasás:</strong> A
              csatlakoztatott fizikai 2D QR- és vonalkódolvasó (USB/Bluetooth
              HID) mostantól bármely megnyitott ablakban (
              <code className="font-mono">/reception</code>,{' '}
              <code className="font-mono">/monitor</code>,{' '}
              <code className="font-mono">/tablet</code>,{' '}
              <code className="font-mono">/demo</code>) azonnal érzékeli a
              leolvasást.
            </li>
            <li>
              <strong>Input Stealth Guard védelem:</strong> Ha a kurzor éppen
              egy keresőmezőben vagy űrlapon áll, a gépi QR-olvasás nem íródik
              bele véletlenül a szövegmezőbe, és nem küldi el az űrlapot.
            </li>
            <li>
              <strong>
                Magyar (HU QWERTZ) billentyűzet és okos QR feloldás:
              </strong>{' '}
              Automatikusan javítja a magyar billentyűzetkiosztás miatt eltolt
              karaktereket (
              <code className="font-mono">§&apos;&quot;+!%/=()</code> →{' '}
              <code className="font-mono">0-9</code>), valamint felismeri az
              URL-eket, JSON kódokat és előtagokat (
              <code className="font-mono">REFORM:100001</code>,{' '}
              <code className="font-mono">#100001</code>).
            </li>
            <li>
              <strong>Élő Szkenner Csatorna kapcsoló:</strong> A fejlécben 1
              kattintással szüneteltethető vagy visszakapcsolható a fizikai
              olvasó figyelése, és látható az utoljára beolvasott kód.
            </li>
          </ul>
        </section>

        {/* 2. Fejlett Dual-Mode Vendégmonitor és 6 Jegyű Párosítás */}
        <section className="space-y-2">
          <h3 className={sectionTitleClassName}>
            2. Megújult Dual-Mode Vendégmonitor & 6 Jegyű Tablet Párosítás
          </h3>
          <ul className={listClassName}>
            <li>
              <strong>1. Üzemmód — Azonos PC Másodlagos Kijelző:</strong> Ha a
              recepciós gépen be vagy jelentkezve, a{' '}
              <code className="font-mono">/monitor</code> oldal{' '}
              <strong>párosító kód megadása nélkül azonnal működik</strong>.
            </li>
            <li>
              <strong>2. Üzemmód — Különálló Tablet / iPad / TV:</strong> Nem
              bejelentkezett eszközön a{' '}
              <code className="font-mono">/monitor</code> oldal biztonsági
              zárolási képernyőt mutat, amíg be nem ütik a recepción generált{' '}
              <strong>10 percig érvényes 6 jegyű párosító kódot</strong>.
            </li>
            <li>
              <strong>Teljes eszközmenedzsment és Teszt Jel:</strong> Egyedi
              kijelzőnév-ellenőrzés, átnevezés, lejárati visszaszámláló, új kód
              generálása, távoli vagy helyi párosítás-bontás, valamint{' '}
              <strong>Teszt Jel küldése</strong> közvetlenül a kijelzőkre.
            </li>
          </ul>
        </section>

        {/* 3. Köredzés vs. Alkalmas Kezelés & Adatvédett Monitor */}
        <section className="space-y-2">
          <h3 className={sectionTitleClassName}>
            3. Köredzés vs. Alkalmas Kezelés és Adatvédett Vendégmonitor
          </h3>
          <ul className={listClassName}>
            <li>
              <strong>Kettős érkezési logika:</strong> Havi tagságos vagy
              időkorlátos Köredzésnél a rendszer{' '}
              <strong>0 alkalmat von le</strong>; Alkalmas kezelésnél (pl.
              Hypoxi, Reformer) dedikált ablakban választható ki a kezelés és a
              bérlet (<code className="font-mono">-1 alkalom</code>), amely
              indoklással vissza is vonható.
            </li>
            <li>
              <strong>Szigorú adatvédelem a Vendégmonitoron:</strong> A vendégek
              felé fordított kijelzőn soha nem jelenik meg tartozás vagy
              pénzügyi figyelmeztetés — köredzésnél csak az üdvözlés, kezelésnél
              pedig a kezelés neve és a hátralévő alkalmak száma látható.
            </li>
            <li>
              <strong>Állítható üdvözlési idő:</strong> Az Admin fülön 3 és 30
              másodperc között állítható az üdvözlő üzenet megjelenítési ideje.
            </li>
          </ul>
        </section>

        {/* 4. Pénzügy, Havi Tagságok, Kartoték és Tablet Aláírás */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <section className="space-y-2">
            <h3 className={sectionTitleClassName}>
              4. Havi Tagságok & Pénzügyi Allokáció
            </h3>
            <ul className={listClassName}>
              <li>
                Havi köredzés tagságok (
                <code className="font-mono">ACTIVE</code>,{' '}
                <code className="font-mono">PAUSED</code>,{' '}
                <code className="font-mono">TERMINATED</code>) és esedékességek
                kezelése.
              </li>
              <li>
                Hátralék-kategóriák (<code className="font-mono">1–5</code>,{' '}
                <code className="font-mono">6–15</code>,{' '}
                <code className="font-mono">15+ nap</code>) külön recepciós
                figyelmeztetéssel.
              </li>
              <li>
                Részbefizetés (<code className="font-mono">PARTIAL</code>) és
                célzott befizetés rögzítése konkrét tagdíjhoz vagy bérlethez.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className={sectionTitleClassName}>
              5. Bővített Kartoték & Tablet Aláírás
            </h3>
            <ul className={listClassName}>
              <li>
                Testmérések naplózása (súly, testzsír%, izomtömeg, körméretek).
              </li>
              <li>
                Kliensoldali automatikus <strong>WebP képoptimalizáló</strong> a
                vendégfotókhoz.
              </li>
              <li>Belső recepciós megjegyzések és kiküldött e-mail napló.</li>
              <li>
                Dedikált <strong>/tablet</strong> aláíró felület GDPR és
                állapotfelmérő ívekhez.
              </li>
            </ul>
          </section>
        </div>

        {/* 6. Egyéb változások a v0.1-hez képest */}
        <section className="space-y-2">
          <h3 className={sectionTitleClassName}>
            Mi változott még a v0.1-hez képest?
          </h3>
          <ul className={listClassName}>
            <li>
              <strong>Gyorsabb dupla-leolvasás védelem:</strong> A véletlen
              dupla csippantás védelmi ablaka 60 mp-ről{' '}
              <strong>10 másodpercre</strong> finomhangolva, 1 kattintásos
              felülbírálási lehetőséggel.
            </li>
            <li>
              <strong>Napi műszerfal (Dashboard):</strong>{' '}
              Születésnapos/névnapos ünnepeltek, lejáró bérletek és
              szolgáltatás-megoszlás összesítő.
            </li>
            <li>
              <strong>Sötét mód (Dark Mode) kontrasztjavítások:</strong>{' '}
              Kártyák, státusz-jelvények és gombok olvashatóságának
              finomhangolása sötét recepciós témában.
            </li>
          </ul>
        </section>
      </DialogBody>

      <DialogFooter>
        <p className="mr-auto text-xs text-muted-foreground max-md:w-full">
          Részletes műszaki dokumentáció:{' '}
          <code className="font-mono">docs/versions/0.2v.md</code>
        </p>
        <DialogClose asChild>
          <Button variant="primary">Bezárás</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
