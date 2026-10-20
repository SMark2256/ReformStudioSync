import { useEffect, useRef } from 'react';

interface UseBarcodeScannerOptions {
  onScan: (barcode: string) => void;
  enabled?: boolean;
  maxIntervalMs?: number;
  minLength?: number;
}

/**
 * Globális fizikai USB/Bluetooth HID vonalkódolvasó hook.
 * Megkülönbözteti a gépi (<45ms karakterenkénti) beolvasást az emberi gépeléstől,
 * és akkor is működik, ha a fókusz nincs keresőmezőn vagy ha Toast üzenet jelenik meg.
 */
export function useBarcodeScanner({
  onScan,
  enabled = true,
  maxIntervalMs = 45,
  minLength = 4,
}: UseBarcodeScannerOptions) {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInputFocused =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      const now = performance.now();
      const elapsed = now - lastKeyTimeRef.current;

      if (e.key === 'Enter') {
        if (bufferRef.current.length >= minLength && elapsed < maxIntervalMs * 3) {
          e.preventDefault();
          const scannedCode = bufferRef.current;
          bufferRef.current = '';
          onScanRef.current(scannedCode);
          return;
        }
        bufferRef.current = '';
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (elapsed > maxIntervalMs) {
          bufferRef.current = e.key;
        } else {
          bufferRef.current += e.key;
        }
        lastKeyTimeRef.current = now;

        // Ha nem beviteli mezőben vagyunk és gyors sorozat jön, ne görgessen / aktiváljon mást
        if (!isInputFocused && bufferRef.current.length > 2) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [enabled, maxIntervalMs, minLength]);
}
