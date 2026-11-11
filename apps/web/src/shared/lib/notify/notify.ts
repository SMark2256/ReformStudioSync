import {
  CheckInResultPayload,
  CheckInStatus,
  DUPLICATE_SCAN_COOLDOWN_SECONDS,
} from '@reform/shared';
import { toast } from 'sonner';
import { soundFeedback } from '../sound';

export interface CheckInToastCallbacks {
  onRevoke?: (checkInId: string) => void;
  onForceDuplicate?: (barcode: string) => void;
  onOpenSellModal?: (guestId: string, suggestedTemplateId?: string | null) => void;
}

export const notify = {
  /** `id` megadásakor az azonos azonosítójú toast frissül, nem halmozódik. */
  success(title: string, description?: string, options?: { id?: string }) {
    toast.success(title, {
      id: options?.id,
      description,
      duration: 4000,
    });
  },

  warning(title: string, description?: string) {
    soundFeedback.playWarning();
    toast.warning(title, {
      description,
      duration: 5500,
    });
  },

  /** `id` megadásakor az azonos azonosítójú toast frissül, nem halmozódik. */
  error(title: string, description?: string, options?: { id?: string }) {
    soundFeedback.playError();
    toast.error(title, {
      id: options?.id,
      description,
      duration: 6500,
    });
  },

  info(title: string, description?: string) {
    toast.info(title, {
      description,
      duration: 4000,
    });
  },

  checkInResult(
    payload: CheckInResultPayload,
    callbacks?: CheckInToastCallbacks,
  ) {
    // Alkalmas bérlet (TICKET-39): nincs belépés, a kezelésválasztó ablak nyílik meg.
    if (payload.status === CheckInStatus.TREATMENT_SELECTION_REQUIRED) {
      soundFeedback.playWarning();
      toast.info(`Kezelésválasztás: ${payload.guestName}`, {
        description:
          payload.reason ??
          'Alkalmas bérlet: a belépés a kezelés kiválasztásával és az alkalom levonásával rögzül.',
        duration: 5500,
      });
      return;
    }

    if (payload.status === CheckInStatus.SUCCESS) {
      const hasWarnings = payload.warnings && payload.warnings.length > 0;
      if (hasWarnings) {
        soundFeedback.playWarning();
      } else {
        soundFeedback.playSuccess();
      }

      const isCircuit = payload.mode === 'CIRCUIT_GREETING';
      const remainingText = isCircuit
        ? 'Köredzés érkezés (0 levonás)'
        : payload.remainingPasses === 'Korlátlan'
          ? 'Korlátlan bérlet'
          : `Hátralévő alkalmak: ${payload.remainingPasses} / ${payload.totalPasses ?? '?'} db`;

      const warningMessages: string[] = [];
      if (payload.warnings?.includes('LAST_OCCASION')) {
        warningMessages.push(
          payload.remainingPasses === 0
            ? 'Bérlet kimerült (0 alkalom maradt)!'
            : 'Már csak 1 alkalom maradt!',
        );
      }
      if (payload.warnings?.includes('LOW_OCCASIONS')) {
        warningMessages.push('Már csak 2 alkalom maradt a bérleten!');
      }
      if (payload.warnings?.includes('EXPIRING_SOON')) {
        warningMessages.push('A bérlet hamarosan lejár!');
      }
      if (
        payload.warnings?.includes('OVERDUE_DUES') &&
        payload.overdueAmountHuf
      ) {
        warningMessages.push(
          `Tagdíj elmaradás: ${payload.overdueAmountHuf.toLocaleString('hu-HU')} Ft (${payload.overdueDays ?? 1} nap késés)!`,
        );
      }

      const description = [
        payload.serviceName
          ? `${payload.serviceName} • ${remainingText}`
          : payload.passName
            ? `${payload.passName} • ${remainingText}`
            : remainingText,
        ...warningMessages,
      ].join(' — ');

      if (hasWarnings && payload.guestId && callbacks?.onOpenSellModal) {
        toast.warning(`Rögzítve (Figyelem!): ${payload.guestName}`, {
          description,
          duration: 7500,
          action: {
            label: 'Bérlet megújítás',
            onClick: () =>
              callbacks.onOpenSellModal?.(
                payload.guestId!,
                payload.suggestedRenewalTemplateId,
              ),
          },
        });
      } else {
        toast.success(
          isCircuit
            ? `Köredzés érkezés: ${payload.guestName}`
            : `Kezelés levonva: ${payload.guestName}`,
          {
            description,
            duration: 5500,
            action:
              payload.checkInId && callbacks?.onRevoke
                ? {
                    label: 'Sztornó (Visszavonás)',
                    onClick: () => callbacks.onRevoke?.(payload.checkInId!),
                  }
                : undefined,
          },
        );
      }
      return;
    }

    if (payload.status === CheckInStatus.DUPLICATE_SCAN) {
      soundFeedback.playWarning();
      toast.warning(`Dupla leolvasás védelem (${DUPLICATE_SCAN_COOLDOWN_SECONDS} mp): ${payload.guestName}`, {
        description:
          payload.reason ??
          `A vendég ${DUPLICATE_SCAN_COOLDOWN_SECONDS} másodpercen belül már be lett léptetve. Nem történt új levonás.`,
        duration: 7000,
        action: callbacks?.onForceDuplicate
          ? {
              label: 'Mégis rögzítés',
              onClick: () => callbacks.onForceDuplicate?.(payload.barcode),
            }
          : undefined,
      });
      return;
    }

    if (payload.status === CheckInStatus.DENIED) {
      soundFeedback.playError();
      toast.error(`Belépés elutasítva: ${payload.guestName}`, {
        description: payload.reason ?? 'Nincs érvényes bérlet!',
        duration: 8500,
        action:
          payload.guestId && callbacks?.onOpenSellModal
            ? {
                label: 'Bérlet eladása most',
                onClick: () =>
                  callbacks.onOpenSellModal?.(
                    payload.guestId!,
                    payload.suggestedRenewalTemplateId,
                  ),
              }
            : undefined,
      });
    }
  },
};
