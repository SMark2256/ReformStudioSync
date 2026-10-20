import {
  CheckInResultPayload,
  CheckInRevokedPayload,
  CheckInStatus,
} from '@reform/shared';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  RotateCcw,
  Sparkles,
  Ticket,
  XCircle,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';

interface MonitorDisplayCardProps {
  activeResult: CheckInResultPayload | null;
  revokedBanner?: CheckInRevokedPayload | null;
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
        className={`flex flex-col items-center justify-center rounded-3xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-2xl transition-all duration-300 ${
          compact ? 'min-h-[340px] p-6' : 'min-h-[78vh] p-12'
        }`}
      >
        <RotateCcw
          className={compact ? 'h-14 w-14 mb-3' : 'h-24 w-24 mb-6'}
        />
        <span className="rounded-full bg-white/20 px-4 py-1 text-xs font-bold uppercase tracking-widest">
          Beléptetés Sztornózva
        </span>
        <h2
          className={`mt-3 font-extrabold text-center ${
            compact ? 'text-2xl' : 'text-5xl'
          }`}
        >
          {revokedBanner.guestName}
        </h2>
        <p
          className={`mt-2 text-amber-100 text-center ${
            compact ? 'text-sm' : 'text-2xl'
          }`}
        >
          Az alkalom jóváírva. Aktuális egyenleg:{' '}
          <strong className="text-white">
            {revokedBanner.restoredRemainingPasses === 'Korlátlan'
              ? 'Korlátlan'
              : `${revokedBanner.restoredRemainingPasses} alkalom`}
          </strong>
        </p>
      </div>
    );
  }

  if (!activeResult) {
    return (
      <div
        className={`relative flex flex-col items-center justify-between overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-white shadow-2xl ${
          compact ? 'min-h-[340px] p-6' : 'min-h-[78vh] p-12'
        }`}
      >
        <div className="flex w-full items-center justify-between text-slate-400">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-400" />
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">
              ReformStudio • Vendégmonitor
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
            Üdvözlünk a ReformStudióban!
          </h2>
          <p
            className={`mt-3 max-w-md text-slate-300 ${
              compact ? 'text-sm' : 'text-xl'
            }`}
          >
            Kérjük, érintsd vagy mutasd fel a belépőkártyádat a recepción a beléptetéshez.
          </p>
        </div>

        <div className="w-full border-t border-white/10 pt-3 flex items-center justify-between text-xs text-slate-400">
          <span>Valós idejű szinkronizáció aktív</span>
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

  const isSuccess = activeResult.status === CheckInStatus.SUCCESS;
  const isDuplicate = activeResult.status === CheckInStatus.DUPLICATE_SCAN;
  const hasWarnings =
    activeResult.warnings && activeResult.warnings.length > 0;

  const bgClass = !isSuccess
    ? isDuplicate
      ? 'from-amber-500 via-amber-600 to-orange-700'
      : 'from-rose-600 via-red-600 to-rose-800'
    : hasWarnings
      ? 'from-emerald-600 via-teal-600 to-amber-600'
      : 'from-emerald-600 via-emerald-500 to-teal-700';

  return (
    <div
      className={`flex flex-col items-center justify-between rounded-3xl bg-gradient-to-br ${bgClass} text-white shadow-2xl transition-all duration-300 ${
        compact ? 'min-h-[340px] p-6' : 'min-h-[78vh] p-12'
      }`}
    >
      <div className="flex w-full items-center justify-between">
        <span className="rounded-full bg-black/20 px-4 py-1 text-xs font-bold uppercase tracking-widest">
          {isSuccess
            ? 'Sikeres Belépés'
            : isDuplicate
              ? 'Már Beléptetve (60 mp)'
              : 'Belépés Elutasítva'}
        </span>
        <span className="font-mono text-xs text-white/80">
          #{activeResult.barcode}
        </span>
      </div>

      <div className="my-auto flex flex-col items-center text-center py-4">
        {isSuccess ? (
          <CheckCircle2
            className={compact ? 'h-14 w-14 mb-3' : 'h-24 w-24 mb-5'}
          />
        ) : isDuplicate ? (
          <AlertTriangle
            className={compact ? 'h-14 w-14 mb-3' : 'h-24 w-24 mb-5'}
          />
        ) : (
          <XCircle className={compact ? 'h-14 w-14 mb-3' : 'h-24 w-24 mb-5'} />
        )}

        <p
          className={`font-medium text-white/90 ${
            compact ? 'text-sm' : 'text-2xl'
          }`}
        >
          {isSuccess ? 'Jó edzést kívánunk,' : 'Vendég:'}
        </p>
        <h1
          className={`mt-1 font-black tracking-tight ${
            compact ? 'text-3xl' : 'text-6xl'
          }`}
        >
          {activeResult.guestName}
        </h1>

        {activeResult.passName && (
          <p
            className={`mt-2 font-semibold text-white/90 ${
              compact ? 'text-sm' : 'text-2xl'
            }`}
          >
            {activeResult.passName}
          </p>
        )}

        {isSuccess || isDuplicate ? (
          <div
            className={`mt-5 grid grid-cols-2 gap-4 rounded-2xl bg-black/25 backdrop-blur-md border border-white/20 ${
              compact ? 'px-5 py-3' : 'px-10 py-6'
            }`}
          >
            <div className="text-center border-r border-white/20 pr-4">
              <span className="block text-[11px] uppercase tracking-wider text-white/75">
                Hátralévő Alkalmak
              </span>
              <span
                className={`font-black ${compact ? 'text-2xl' : 'text-5xl'}`}
              >
                {activeResult.remainingPasses === 'Korlátlan'
                  ? 'Korlátlan'
                  : `${activeResult.remainingPasses} db`}
              </span>
            </div>
            <div className="text-center pl-2 flex flex-col justify-center">
              <span className="block text-[11px] uppercase tracking-wider text-white/75">
                Érvényesség Vége
              </span>
              <span
                className={`font-bold flex items-center justify-center gap-1.5 ${
                  compact ? 'text-base mt-1' : 'text-2xl mt-2'
                }`}
              >
                <Calendar className="h-4 w-4" />
                {activeResult.expirationDate
                  ? new Date(activeResult.expirationDate).toLocaleDateString(
                      'hu-HU',
                    )
                  : '—'}
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-2xl bg-black/30 px-6 py-4 border border-white/20 max-w-md">
            <p className={compact ? 'text-base font-bold' : 'text-2xl font-bold'}>
              {activeResult.reason ?? 'Nincs érvényes bérlet!'}
            </p>
            <p className="mt-1 text-xs text-white/80">
              Kérjük, fordulj a recepciós munkatársunkhoz új bérlet vásárlásához.
            </p>
          </div>
        )}

        {hasWarnings && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {activeResult.warnings.includes('LAST_OCCASION') && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-3.5 py-1 text-xs font-extrabold text-slate-950 shadow">
                <AlertTriangle className="h-3.5 w-3.5" />
                {activeResult.remainingPasses === 0
                  ? 'Ez volt az utolsó alkalmad a bérleten!'
                  : 'Már csak 1 alkalom maradt a bérleteden!'}
              </span>
            )}
            {activeResult.warnings.includes('EXPIRING_SOON') && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-300 px-3.5 py-1 text-xs font-extrabold text-slate-950 shadow">
                <Clock className="h-3.5 w-3.5" />
                A bérleted 3 napon belül lejár!
              </span>
            )}
          </div>
        )}
      </div>

      <div className="w-full text-center text-xs text-white/75">
        A képernyő néhány másodperc múlva automatikusan alaphelyzetbe áll...
      </div>
    </div>
  );
};
