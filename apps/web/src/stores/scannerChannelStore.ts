import { CheckInResultPayload, CheckInRevokedPayload } from '@reform/shared';
import { create } from 'zustand';

interface ScannerChannelState {
  isListening: boolean;
  isProcessing: boolean;
  scanCount: number;
  lastScannedCode: string | null;
  lastScanAt: string | null;
  lastCheckInResult: CheckInResultPayload | null;
  lastRevokedResult: CheckInRevokedPayload | null;
  scanHistory: CheckInResultPayload[];

  setListening: (listening: boolean) => void;
  setProcessing: (processing: boolean) => void;
  recordScanAttempt: (barcode: string) => void;
  recordCheckInResult: (result: CheckInResultPayload) => void;
  recordRevokedResult: (revoked: CheckInRevokedPayload | null) => void;
  clearLastResult: () => void;
}

export const useScannerChannelStore = create<ScannerChannelState>((set) => ({
  isListening: true,
  isProcessing: false,
  scanCount: 0,
  lastScannedCode: null,
  lastScanAt: null,
  lastCheckInResult: null,
  lastRevokedResult: null,
  scanHistory: [],

  setListening: (isListening) => set({ isListening }),
  setProcessing: (isProcessing) => set({ isProcessing }),
  recordScanAttempt: (barcode) =>
    set((state) => ({
      scanCount: state.scanCount + 1,
      lastScannedCode: barcode,
      lastScanAt: new Date().toISOString(),
    })),
  recordCheckInResult: (result) =>
    set((state) => ({
      lastCheckInResult: result,
      lastRevokedResult: null,
      lastScannedCode: result.barcode,
      lastScanAt: result.timestamp,
      scanHistory: [
        result,
        ...state.scanHistory.filter(
          (item) =>
            item.checkInId !== result.checkInId ||
            item.timestamp !== result.timestamp,
        ),
      ].slice(0, 12),
    })),
  recordRevokedResult: (revoked) =>
    set((state) => ({
      lastRevokedResult: revoked,
      lastCheckInResult:
        revoked && state.lastCheckInResult?.checkInId === revoked.checkInId
          ? null
          : state.lastCheckInResult,
    })),
  clearLastResult: () =>
    set({
      lastCheckInResult: null,
      lastRevokedResult: null,
    }),
}));
