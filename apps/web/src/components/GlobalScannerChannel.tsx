import {
  CheckInResultPayload,
  CheckInRevokedPayload,
  SCANNER_BROADCAST_CHANNEL,
  VisitType,
} from '@reform/shared';
import { useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  normalizeScannedCode,
  useBarcodeScanner,
} from '../hooks/useBarcodeScanner';
import {
  broadcastToScannerChannel,
  MonitorBroadcastMessage,
  useMonitorChannel,
} from '../hooks/useMonitorChannel';
import { api } from '../lib/api';
import { notify } from '../lib/notify';
import { useOfflineQueueStore } from '../stores/offlineQueueStore';
import { useScannerChannelStore } from '../stores/scannerChannelStore';

/**
 * Globális, oldalaktól független QR-kód / vonalkód szkennelési csatorna.
 * Folyamatosan figyeli a fizikai 2D QR / vonalkód olvasót (USB/Bluetooth HID)
 * az alkalmazás bármely oldalán (/reception, /monitor, /tablet, /demo),
 * feldolgozza a beléptetést, szinkronizálja a React Query cache-t és a többi megnyitott ablakot.
 */
export const GlobalScannerChannel: React.FC = () => {
  const queryClient = useQueryClient();
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';
  const isMonitorPage = location.pathname === '/monitor';

  const { isOnline, enqueueScan } = useOfflineQueueStore();
  const {
    isListening,
    setProcessing,
    recordScanAttempt,
    recordCheckInResult,
    recordRevokedResult,
  } = useScannerChannelStore();

  const invalidateCheckInQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['guests'] });
    queryClient.invalidateQueries({ queryKey: ['today-checkins'] });
    queryClient.invalidateQueries({ queryKey: ['today-dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['overdue-memberships'] });
  }, [queryClient]);

  const handleRevoke = useCallback(
    async (checkInId: string) => {
      try {
        const revoked = await api.revokeCheckIn(checkInId);
        recordRevokedResult(revoked);
        broadcastToScannerChannel({
          type: 'CHECKIN_REVOKED',
          payload: revoked,
        });
        if (!isMonitorPage) {
          notify.success(
            `Beléptetés sztornózva: ${revoked.guestName}`,
            `Az alkalom visszaírva. Új egyenleg: ${revoked.restoredRemainingPasses}`,
          );
        }
        invalidateCheckInQueries();
      } catch (err) {
        if (!isMonitorPage) {
          notify.error('Sztornó hiba', (err as Error).message);
        }
      }
    },
    [recordRevokedResult, isMonitorPage, invalidateCheckInQueries],
  );

  const executeScan = useCallback(
    async (
      rawOrNormalizedCode: string,
      options?: {
        forceDuplicate?: boolean;
        visitType?: VisitType;
        onOpenSellModal?: (
          guestId: string,
          suggestedTemplateId?: string | null,
        ) => void;
      },
    ): Promise<CheckInResultPayload | null> => {
      const code = normalizeScannedCode(rawOrNormalizedCode);
      if (!code) return null;

      recordScanAttempt(code);
      broadcastToScannerChannel({
        type: 'SCAN_TRIGGERED',
        payload: {
          barcode: code,
          rawBarcode: rawOrNormalizedCode,
          sourceRoute: location.pathname,
          scannedAt: new Date().toISOString(),
        },
      });

      if (!isOnline) {
        const queued = enqueueScan(code);
        if (!isMonitorPage) {
          notify.warning(
            `Offline mód: QR/Vonalkód várólistára mentve (#${queued.barcode})`,
            'Az internetkapcsolat helyreállásakor automatikusan szinkronizálódik.',
          );
        }
        return null;
      }

      setProcessing(true);
      try {
        const result = await api.scanCheckIn({
          barcode: code,
          forceDuplicate: options?.forceDuplicate,
          visitType: options?.visitType ?? VisitType.CIRCUIT_TRAINING,
        });

        recordCheckInResult(result);
        broadcastToScannerChannel({
          type: 'CHECKIN_RESULT',
          payload: result,
        });
        invalidateCheckInQueries();

        // A Vendégmonitoron (/monitor) a MonitorPage saját maga játssza le a hangot és mutatja a kártyát
        // (adatvédett módon, tartozások nélkül), ezért ott nem dobunk recepciós toastot.
        if (!isMonitorPage) {
          notify.checkInResult(result, {
            onRevoke: (chkId) => handleRevoke(chkId),
            onForceDuplicate: (dupCode) => {
              void executeScan(dupCode, {
                ...options,
                forceDuplicate: true,
              });
            },
            onOpenSellModal: options?.onOpenSellModal,
          });
        }

        return result;
      } catch (err) {
        if (!isMonitorPage) {
          notify.error(
            `Ismeretlen vagy hibás QR/vonalkód (#${code})`,
            (err as Error).message,
          );
        }
        return null;
      } finally {
        setProcessing(false);
      }
    },
    [
      recordScanAttempt,
      location.pathname,
      isOnline,
      enqueueScan,
      isMonitorPage,
      setProcessing,
      recordCheckInResult,
      invalidateCheckInQueries,
      handleRevoke,
    ],
  );

  // Globális fizikai 2D QR / Vonalkód HID olvasó figyelése minden oldalon (kivéve /login)
  useBarcodeScanner({
    onScan: (code) => {
      void executeScan(code);
    },
    enabled: isListening && !isLoginPage,
  });

  // Másik ablakból (pl. /monitor vagy /tablet vagy /reception) érkező szkenner-események szinkronizálása
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window))
      return;
    const channel = new BroadcastChannel(SCANNER_BROADCAST_CHANNEL);

    channel.onmessage = (event: MessageEvent<MonitorBroadcastMessage>) => {
      if (event.data?.type === 'CHECKIN_RESULT') {
        recordCheckInResult(event.data.payload);
        invalidateCheckInQueries();
      } else if (event.data?.type === 'CHECKIN_REVOKED') {
        recordRevokedResult(event.data.payload);
        invalidateCheckInQueries();
      } else if (event.data?.type === 'SCAN_TRIGGERED') {
        recordScanAttempt(event.data.payload.barcode);
      }
    };

    return () => {
      channel.close();
    };
  }, [recordCheckInResult, recordRevokedResult, recordScanAttempt, invalidateCheckInQueries]);

  // WebSocket (/monitor) csatornán érkező távoli beléptetések szinkronizálása
  useMonitorChannel({
    onCheckInResult: useCallback(
      (payload: CheckInResultPayload) => {
        recordCheckInResult(payload);
        invalidateCheckInQueries();
      },
      [recordCheckInResult, invalidateCheckInQueries],
    ),
    onCheckInRevoked: useCallback(
      (payload: CheckInRevokedPayload) => {
        recordRevokedResult(payload);
        invalidateCheckInQueries();
      },
      [recordRevokedResult, invalidateCheckInQueries],
    ),
  });

  return null;
};
