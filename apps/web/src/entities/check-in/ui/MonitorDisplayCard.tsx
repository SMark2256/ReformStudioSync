import {
  MonitorCheckInPayload,
  MonitorCheckInRevokedPayload,
} from '@reform/shared';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  RotateCcw,
  Sparkles,
  Ticket,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';

interface MonitorDisplayCardProps {
  activeResult: MonitorCheckInPayload | null;
  revokedBanner?: MonitorCheckInRevokedPayload | null;
  compact?: boolean;
}

export const MonitorDisplayCard: React.FC<MonitorDisplayCardProps> = ({
  activeResult,
  revokedBanner,
  compact = false,
}) => {
  const [clock, setClock] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (revokedBanner) {
    return (
      <div
        className={`monitor-invariant flex flex-col items-center justify-center rounded-3xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-2xl transition-all duration-300 ${
          compact ? 'min-h-[340px] p-6' : 'min-h-[78vh] p-12'
        }`}
      >
        <RotateCcw
          className={compact ? 'h-14 w-14 mb-3' : 'h-24 w-24 mb-6'}
        />
        <span className="rounded-full bg-white/20 px-4 py-1 text-xs font-bold uppercase tracking-widest">
          Rögzítés Visszavonva
        </span>
        <p
          className={`mt-2 text-amber-100 text-center ${
            compact ? 'text-sm' : 'text-2xl'
          }`}
        >
          Az előző rögzítés sztornózva lett. Kérjük, egyeztess a recepcióval.
        </p>
      </div>
    );
  }

  if (!activeResult) {
    return (
      <div
        className={`monitor-invariant relative flex flex-col items-center justify-between overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-white shadow-2xl ${
          compact ? 'min-h-[340px] p-6' : 'min-h-[78vh] p-12'
        }`}
      >
        <div className="flex w-full items-center justify-between text-slate-400">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-400" />
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">
              RE-FORM STÚDIÓ • Vendégmonitor
            </span>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-sm text-slate-300">
            <Clock className="h-4 w-4 text-emerald-400" />
            {clock.toLocaleTimeString('hu-HU', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </div>
        </div>

        <div className="my-auto flex flex-col items-center text-center py-6">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/30">
            <Ticket className="h-8 w-8 text-emerald-400" />
          </div>
          <h2
            className={`font-extrabold tracking-tight text-white ${
              compact ? 'text-2xl' : 'text-5xl'
            }`}
          >
            RE-FORM STÚDIÓ
          </h2>
          <p
            className={`mt-2 font-semibold text-emerald-300 ${
              compact ? 'text-base' : 'text-2xl'
            }`}
          >
            Üdvözlünk! Kérjük, érintsd le a belépőkártyádat a recepción.
          </p>
        </div>

        <div className="w-full border-t border-white/10 pt-3 flex items-center justify-between text-xs text-slate-400">
          <span>Adatvédett vendégkijelző</span>
          <span>
            {clock.toLocaleDateString('hu-HU', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              weekday: 'long',
            })}
          </span>
        </div>
      </div>
    );
  }

  // A payload már szerveroldalon / a broadcast előtt szűkítve van (toMonitorPayload):
  // elutasításnál nincs benne név, ok vagy tartozás.
  const isSuccess = activeResult.status === 'SUCCESS';
  const isDuplicate = activeResult.status === 'DUPLICATE';
  const isTreatment = activeResult.mode === 'TREATMENT_GREETING';
  const hasSafeWarnings = activeResult.warnings.length > 0;

  const bgClass = !isSuccess
    ? isDuplicate
      ? 'from-amber-500 via-amber-600 to-orange-700'
      : 'from-slate-800 via-slate-900 to-rose-950'
    : hasSafeWarnings
      ? 'from-emerald-600 via-teal-600 to-amber-600'
      : 'from-emerald-600 via-emerald-500 to-teal-700';

  return (
    <div
      className={`monitor-invariant flex flex-col items-center justify-between rounded-3xl bg-gradient-to-br ${bgClass} text-white shadow-2xl transition-all duration-300 ${
        compact ? 'min-h-[340px] p-6' : 'min-h-[78vh] p-12'
      }`}
    >
      {/* Top Bar: NEVER shows barcode or financial details */}
      <div className="flex w-full items-center justify-between">
        <span className="rounded-full bg-black/20 px-4 py-1 text-xs font-bold uppercase tracking-widest">
          {isSuccess
            ? isTreatment
              ? 'Kezelés • Üdvözlés'
              : 'Női Köredzés • Érkezés'
            : isDuplicate
              ? 'Érkezés Már Rögzítve'
              : 'Recepciós Egyeztetés'}
        </span>
        <span className="text-xs font-semibold text-white/80">
          RE-FORM STÚDIÓ
        </span>
      </div>

      <div className="my-auto flex flex-col items-center text-center py-4">
        {isSuccess ? (
          <CheckCircle2
            className={compact ? 'h-14 w-14 mb-3' : 'h-24 w-24 mb-5'}
          />
        ) : (
          <AlertTriangle
            className={compact ? 'h-14 w-14 mb-3' : 'h-24 w-24 mb-5'}
          />
        )}

        {activeResult.displayName && (
          <>
            <p
              className={`font-medium text-white/90 ${
                compact ? 'text-sm' : 'text-2xl'
              }`}
            >
              Üdvözlünk,
            </p>
            <h1
              className={`mt-1 font-black tracking-tight ${
                compact ? 'text-3xl' : 'text-6xl'
              }`}
            >
              {activeResult.displayName}!
            </h1>
          </>
        )}

        {isSuccess || isDuplicate ? (
          !isTreatment ? (
            /* 5.3 Köredzéses érkezés után: „Üdvözlünk, [Keresztnév]! Jó edzést kívánunk!” */
            <div
              className={`mt-6 rounded-2xl bg-black/25 backdrop-blur-md border border-white/20 ${
                compact ? 'px-6 py-4' : 'px-12 py-7'
              }`}
            >
              <p
                className={`font-extrabold text-white ${
                  compact ? 'text-xl' : 'text-4xl'
                }`}
              >
                Jó edzést kívánunk!
              </p>
            </div>
          ) : (
            /* 5.3 Alkalmas kezelés levonása után: „Üdvözlünk, [Név]! [Kezelés neve]. Hátralévő alkalmak: [X]. Kellemes kezelést kívánunk!” */
            <div
              className={`mt-5 flex flex-col items-center gap-3 rounded-2xl bg-black/25 backdrop-blur-md border border-white/20 ${
                compact ? 'px-6 py-4' : 'px-12 py-7'
              }`}
            >
              <span
                className={`font-extrabold text-emerald-200 ${
                  compact ? 'text-lg' : 'text-3xl'
                }`}
              >
                {activeResult.serviceName ?? 'Kezelés'}
              </span>

              <div className="my-1">
                <span className="block text-xs uppercase tracking-wider text-white/80">
                  Hátralévő alkalmak
                </span>
                <span
                  className={`font-black text-white ${
                    compact ? 'text-3xl' : 'text-6xl'
                  }`}
                >
                  {activeResult.remainingPasses === 'Korlátlan'
                    ? 'Korlátlan'
                    : `${activeResult.remainingPasses}`}
                </span>
              </div>

              <p
                className={`font-bold text-white/95 ${
                  compact ? 'text-base' : 'text-2xl'
                }`}
              >
                Kellemes kezelést kívánunk!
              </p>
            </div>
          )
        ) : (
          /* Semleges elutasító üzenet: név, ok és pénzügyi részletek nélkül */
          <div className="rounded-2xl bg-black/30 px-6 py-4 border border-white/20 max-w-md">
            <p
              className={compact ? 'text-xl font-bold' : 'text-4xl font-bold'}
            >
              Kérjük, fáradj a recepcióhoz!
            </p>
          </div>
        )}

        {hasSafeWarnings && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-3.5 py-1 text-xs font-extrabold text-slate-950 shadow">
              <AlertTriangle className="h-3.5 w-3.5" />
              {activeResult.remainingPasses === 0
                ? 'Ez volt az utolsó alkalmad a bérleten!'
                : `Már csak ${activeResult.remainingPasses} alkalom maradt a bérleteden!`}
            </span>
          </div>
        )}
      </div>

      <div className="w-full text-center text-xs text-white/75">
        A képernyő néhány másodperc múlva automatikusan alaphelyzetbe áll...
      </div>
    </div>
  );
};
