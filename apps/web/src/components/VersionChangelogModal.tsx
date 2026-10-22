import {
  CheckCircle2,
  FileSignature,
  Info,
  KeyRound,
  QrCode,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  Wrench,
  X,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useThemeStore } from '../stores/themeStore';

interface VersionBadgeProps {
  className?: string;
}

export const VersionBadge: React.FC<VersionBadgeProps> = ({
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { theme } = useThemeStore();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <>
      <div className={`inline-flex items-center gap-1 ${className}`}>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          title="Kattints a v0.2 verzió újdonságainak és változásainak megtekintéséhez"
          className="group inline-flex items-center gap-1.5 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 transition-all cursor-pointer"
        >
          <span>V0.2</span>
          <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-600 text-white group-hover:scale-110 transition-transform">
            <Info className="h-2.5 w-2.5" />
          </span>
        </button>
      </div>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-sm ${
              theme === 'dark' ? 'reception-theme-dark dark' : ''
            }`}
            onClick={() => setIsOpen(false)}
          >
            <div
              className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/30">
                    <Sparkles className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
                        ReformStudioSync — v0.2 Kiadási Jegyzék
                      </h2>
                      <span className="rounded-full bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                        v0.1 → v0.2 Újdonságok
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Összefoglaló az előző (v0.1) verzióhoz képest bekerült új funkciókról, opciókról és fejlesztésekről.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white transition-colors"
                  title="Bezárás (Esc)"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="overflow-y-auto p-6 space-y-5 text-xs sm:text-sm">
                {/* 1. Globális QR / Vonalkód Szkenner Csatorna */}
                <section className="rounded-2xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-500/10 p-4 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <QrCode className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                      1. Globális 2D QR-kód és Vonalkód Szkenner Csatorna (ÚJ)
                    </h3>
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300 list-disc pl-5">
                    <li>
                      <strong>Oldalaktól és fókusztól független olvasás:</strong> A csatlakoztatott fizikai 2D QR- és vonalkódolvasó (USB/Bluetooth HID) mostantól bármely megnyitott ablakban (<code className="font-mono font-bold">/reception</code>, <code className="font-mono font-bold">/monitor</code>, <code className="font-mono font-bold">/tablet</code>, <code className="font-mono font-bold">/demo</code>) azonnal érzékeli a leolvasást.
                    </li>
                    <li>
                      <strong>Input Stealth Guard védelem:</strong> Ha a kurzor éppen egy keresőmezőben vagy űrlapon áll, a gépi QR-olvasás nem íródik bele véletlenül a szövegmezőbe, és nem küldi el az űrlapot.
                    </li>
                    <li>
                      <strong>Magyar (HU QWERTZ) billentyűzet és okos QR feloldás:</strong> Automatikusan javítja a magyar billentyűzetkiosztás miatt eltolt karaktereket (<code className="font-mono">§&apos;&quot;+!%/=()</code> → <code className="font-mono">0-9</code>), valamint felismeri az URL-eket, JSON kódokat és előtagokat (<code className="font-mono">REFORM:100001</code>, <code className="font-mono">#100001</code>).
                    </li>
                    <li>
                      <strong>Élő Szkenner Csatorna kapcsoló:</strong> A fejlécben 1 kattintással szüneteltethető vagy visszakapcsolható a fizikai olvasó figyelése, és látható az utoljára beolvasott kód.
                    </li>
                  </ul>
                </section>

                {/* 2. Fejlett Dual-Mode Vendégmonitor és 6 Jegyű Párosítás */}
                <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 p-4 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                      2. Megújult Dual-Mode Vendégmonitor & 6 Jegyű Tablet Párosítás (ÚJ)
                    </h3>
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300 list-disc pl-5">
                    <li>
                      <strong>1. Üzemmód — Azonos PC Másodlagos Kijelző:</strong> Ha a recepciós gépen be vagy jelentkezve, a <code className="font-mono font-bold">/monitor</code> oldal <strong>párosító kód megadása nélkül azonnal működik</strong>.
                    </li>
                    <li>
                      <strong>2. Üzemmód — Különálló Tablet / iPad / TV:</strong> Nem bejelentkezett eszközön a <code className="font-mono font-bold">/monitor</code> oldal biztonsági zárolási képernyőt mutat, amíg be nem ütik a recepción generált <strong>10 percig érvényes 6 jegyű párosító kódot</strong>.
                    </li>
                    <li>
                      <strong>Teljes eszközmenedzsment és Teszt Jel:</strong> Egyedi kijelzőnév-ellenőrzés, átnevezés, lejárati visszaszámláló, új kód generálása, távoli vagy helyi párosítás-bontás, valamint <strong>Teszt Jel küldése</strong> közvetlenül a kijelzőkre.
                    </li>
                  </ul>
                </section>

                {/* 3. Köredzés vs. Alkalmas Kezelés & Adatvédett Monitor */}
                <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 p-4 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                      3. Köredzés vs. Alkalmas Kezelés és Adatvédett Vendégmonitor (ÚJ)
                    </h3>
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300 list-disc pl-5">
                    <li>
                      <strong>Kettős érkezési logika:</strong> Havi tagságos vagy időkorlátos <em>Köredzésnél</em> a rendszer <strong>0 alkalmat von le</strong>; <em>Alkalmas kezelésnél</em> (pl. Hypoxi, Reformer) dedikált ablakban választható ki a kezelés és a bérlet (<code className="font-mono">-1 alkalom</code>), amely indoklással vissza is vonható.
                    </li>
                    <li>
                      <strong>Szigorú adatvédelem a Vendégmonitoron:</strong> A vendégek felé fordított kijelzőn soha nem jelenik meg tartozás vagy pénzügyi figyelmeztetés — köredzésnél csak az üdvözlés, kezelésnél pedig a kezelés neve és a hátralévő alkalmak száma látható.
                    </li>
                    <li>
                      <strong>Állítható üdvözlési idő:</strong> Az Admin fülön 3 és 30 másodperc között állítható az üdvözlő üzenet megjelenítési ideje.
                    </li>
                  </ul>
                </section>

                {/* 4. Pénzügy, Havi Tagságok, Kartoték és Tablet Aláírás */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                        4. Havi Tagságok & Pénzügyi Allokáció
                      </h4>
                    </div>
                    <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300 list-disc pl-4">
                      <li>Havi köredzés tagságok (<code className="font-mono">ACTIVE</code>, <code className="font-mono">PAUSED</code>, <code className="font-mono">TERMINATED</code>) és esedékességek kezelése.</li>
                      <li>Hátralék-kategóriák (<code className="font-mono">1–5</code>, <code className="font-mono">6–15</code>, <code className="font-mono">15+ nap</code>) külön recepciós figyelmeztetéssel.</li>
                      <li>Részbefizetés (<code className="font-mono">PARTIAL</code>) és célzott befizetés rögzítése konkrét tagdíjhoz vagy bérlethez.</li>
                    </ul>
                  </section>

                  <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                        5. Bővített Kartoték & Tablet Aláírás
                      </h4>
                    </div>
                    <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300 list-disc pl-4">
                      <li>Testmérések naplózása (súly, testzsír%, izomtömeg, körméretek).</li>
                      <li>Kliensoldali automatikus <strong>WebP képoptimalizáló</strong> a vendégfotókhoz.</li>
                      <li>Belső recepciós megjegyzések és kiküldött e-mail napló.</li>
                      <li>
                        <FileSignature className="inline h-3.5 w-3.5 text-amber-500 mr-1" />
                        Dedikált <strong>/tablet</strong> aláíró felület GDPR és állapotfelmérő ívekhez.
                      </li>
                    </ul>
                  </section>
                </div>

                {/* 6. Egyéb változások a v0.1-hez képest */}
                <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                      Mi változott még a v0.1-hez képest?
                    </h3>
                  </div>
                  <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300 list-disc pl-5">
                    <li>
                      <strong>Gyorsabb dupla-leolvasás védelem:</strong> A véletlen dupla csippantás védelmi ablaka 60 mp-ről <strong>10 másodpercre</strong> finomhangolva, 1 kattintásos felülbírálási lehetőséggel.
                    </li>
                    <li>
                      <strong>Napi műszerfal (Dashboard):</strong> Születésnapos/névnapos ünnepeltek, lejáró bérletek és szolgáltatás-megoszlás összesítő.
                    </li>
                    <li>
                      <strong>Sötét mód (Dark Mode) kontrasztjavítások:</strong> Kártyák, státusz-jelvények és gombok olvashatóságának finomhangolása sötét recepciós témában.
                    </li>
                  </ul>
                </section>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 px-6 py-3.5">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Részletes műszaki dokumentáció: <code className="font-mono">docs/versions/0.2v.md</code>
                </span>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition-colors"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Rendben, bezárás
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};
