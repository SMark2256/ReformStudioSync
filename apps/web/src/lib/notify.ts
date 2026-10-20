import { CheckInResultPayload, CheckInStatus } from '@reform/shared';
import { toast } from 'sonner';
import { soundFeedback } from './sound';

export interface CheckInToastCallbacks {
  onRevoke?: (checkInId: string) => void;
  onForceDuplicate?: (barcode: string) => void;
  onOpenSellModal?: (guestId: string, suggestedTemplateId?: string | null) => void;
}

export const notify = {
  success(title: string, description?: string) {
    toast.success(title, {
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

  error(title: string, description?: string) {
    soundFeedback.playError();
    toast.error(title, {
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
    if (payload.status === CheckInStatus.SUCCESS) {
      const hasWarnings = payload.warnings && payload.warnings.length > 0;
      if (hasWarnings) {
        soundFeedback.playWarning();
      } else {
        soundFeedback.playSuccess();
      }

      const remainingText =
        payload.remainingPasses === 'Korlátlan'
          ? 'Korlátlan bérlet'
          : `Maradt: ${payload.remainingPasses} / ${payload.totalPasses ?? '?'} alkalom`;

      const warningMessages: string[] = [];
      if (payload.warnings?.includes('LAST_OCCASION')) {
        warningMessages.push(
          payload.remainingPasses === 0
            ? 'Utolsó alkalom felhasználva!'
            : 'Már csak 1 alkalom maradt!',
        );
      }
      if (payload.warnings?.includes('EXPIRING_SOON')) {
        warningMessages.push('A bérlet 3 napon belül lejár!');
      }

      const description = [
        payload.passName ? `${payload.passName} • ${remainingText}` : remainingText,
        ...warningMessages,
      ].join(' — ');

      if (hasWarnings && payload.guestId && callbacks?.onOpenSellModal) {
        toast.warning(`Beléptetve (Figyelem!): ${payload.guestName}`, {
          description,
          duration: 7500,
          action: {
            label: 'Megújítás 1 kattintással',
            onClick: () =>
              callbacks.onOpenSellModal?.(
                payload.guestId!,
                payload.suggestedRenewalTemplateId,
              ),
          },
        });
      } else {
        toast.success(`Sikeres beléptetés: ${payload.guestName}`, {
          description,
          duration: 5500,
          action:
            payload.checkInId && callbacks?.onRevoke
              ? {
                  label: 'Sztornó (Visszavonás)',
                  onClick: () => callbacks.onRevoke?.(payload.checkInId!),
                }
              : undefined,
        });
      }
      return;
    }

    if (payload.status === CheckInStatus.DUPLICATE_SCAN) {
      soundFeedback.playWarning();
      toast.warning(`Dupla leolvasás védelem: ${payload.guestName}`, {
        description:
          payload.reason ??
          'A vendég 60 másodpercen belül már be lett léptetve. Nem történt új levonás.',
        duration: 7000,
        action: callbacks?.onForceDuplicate
          ? {
              label: 'Mégis levonás (+1 fő)',
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
