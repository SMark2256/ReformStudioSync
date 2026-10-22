import { useEffect, useRef } from 'react';

export interface UseBarcodeScannerOptions {
  onScan: (barcode: string, rawInput?: string) => void;
  enabled?: boolean;
  /**
   * 2D QR-olvasók és Bluetooth HID eszközök esetén a csomagok közötti késleltetés
   * 50-85ms is lehet hosszú (16-36+ jegyű) számsoroknál.
   */
  maxIntervalMs?: number;
  minLength?: number;
  /**
   * Automatikus burst-lezárási idő (ms), ha a 2D QR-olvasó nem küld Enter/Tab karaktert a végén.
   */
  autoCommitTimeoutMs?: number;
}

/**
 * Magyar billentyűzetkiosztáson (HU QWERTZ) az angol (US HID) módban működő
 * 2D QR- és vonalkódolvasók által küldött felső számsor / eltolt karakterek javítása.
 */
const HU_SHIFTED_DIGIT_MAP: Record<string, string> = {
  '§': '0',
  "'": '1',
  '"': '2',
  '+': '3',
  '!': '4',
  '%': '5',
  '/': '6',
  '=': '7',
  '(': '8',
  ')': '9',
  ö: '0',
  Ö: '0',
  ü: '-',
  Ü: '_',
  ó: '=',
  Ó: '+',
};

/**
 * Fizikai billentyűkód (`KeyboardEvent.code`) alapján pontos számjegy vagy karakter kinyerése,
 * hogy a hosszú, összetett számsorok (pl. 16-32 jegyű QR kódok, EAN, UUID, előtagos kódok)
 * 100%-ban immunisak legyenek a Windows/Mac HU vs. US billentyűzetkiosztás különbségeire.
 */
function resolveScannerChar(e: KeyboardEvent): string | null {
  if (e.code && e.code.startsWith('Digit') && e.code.length === 6) {
    const digit = e.code.charAt(5);
    if (digit >= '0' && digit <= '9' && !e.shiftKey) {
      return digit;
    }
  }

  if (e.code && e.code.startsWith('Numpad') && e.code.length === 7) {
    const digit = e.code.charAt(6);
    if (digit >= '0' && digit <= '9') {
      return digit;
    }
  }

  if (e.code === 'NumpadSubtract' || e.code === 'Minus') {
    return '-';
  }

  if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
    return e.key;
  }

  return null;
}

/**
 * QR-kód és vonalkód tartalom tisztítása és normalizálása.
 * Kezeli:
 * - Tetszőleges hosszúságú számsorokat (pl. 100001, 984712039481203948, EAN-13, UUID)
 * - Strukturált QR-kódokat (pl. "REFORM:100001", "CARD#9812371923", JSON {"barcode":"..."})
 * - URL alapú QR-kódokat (pl. "https://reformstudio.hu/checkin/100001")
 * - Magyar billentyűzetkiosztás miatti eltolt számsorokat
 */
export function normalizeScannedCode(raw: string): string {
  let cleaned = raw.trim();
  if (!cleaned) return '';

  // JSON payload támogatás (ha a QR kód JSON objektumot tartalmaz)
  if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
    try {
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;
      const candidate =
        parsed.barcode ?? parsed.code ?? parsed.card ?? parsed.id;
      if (typeof candidate === 'string' || typeof candidate === 'number') {
        cleaned = String(candidate).trim();
      }
    } catch {
      // Nem valid JSON, folytatjuk a szöveges elemzéssel
    }
  }

  // URL alapú QR-kód (pl. https://.../checkin/100001 vagy ?barcode=100001)
  if (/^https?:\/\//i.test(cleaned)) {
    try {
      const url = new URL(cleaned);
      const fromQuery =
        url.searchParams.get('barcode') ||
        url.searchParams.get('code') ||
        url.searchParams.get('card');
      if (fromQuery) {
        cleaned = fromQuery.trim();
      } else {
        const segments = url.pathname.split('/').filter(Boolean);
        if (segments.length > 0) {
          cleaned = segments[segments.length - 1].trim();
        }
      }
    } catch {
      // Fallback ha nem szabványos URL
    }
  }

  // Prefix eltávolítás (pl. REFORM:100001, QR:100001, BARCODE=100001, #100001)
  cleaned = cleaned
    .replace(/^(REFORM|STUDIO|PASS|CARD|QR|BARCODE|ID)[:=#-]\s*/i, '')
    .replace(/^#+/, '')
    .trim();

  // Ha a karakterlánc csak HU eltolt számjegyekből vagy számokból áll, normalizáljuk
  const mappedChars = Array.from(cleaned).map(
    (ch) => HU_SHIFTED_DIGIT_MAP[ch] ?? ch,
  );
  const mappedCandidate = mappedChars.join('');

  // Ha a visszaalakított string tisztán számsor (vagy RS/RF előtagú kód), használjuk azt
  if (/^(RS|RF)?[\d-]+$/i.test(mappedCandidate)) {
    cleaned = mappedCandidate;
  }

  return cleaned;
}

/**
 * Globális fizikai 2D QR-kód és vonalkódolvasó (USB/Bluetooth HID) hook.
 * - Folyamatosan figyel minden oldalon (Capture fázisban).
 * - Támogatja a rövid és a nagyon hosszú, összetett számsorokat is.
 * - Input Stealth Guard: ha a kurzor egy keresőmezőben vagy űrlapban áll (kivéve a dedikált
 *   `data-barcode-input="true"` mezőt), megakadályozza, hogy a gépi QR-beolvasás beleíródjon
 *   a szövegmezőbe vagy véletlenül elküldje az űrlapot.
 */
export function useBarcodeScanner({
  onScan,
  enabled = true,
  maxIntervalMs = 80,
  minLength = 4,
  autoCommitTimeoutMs = 110,
}: UseBarcodeScannerOptions) {
  const bufferRef = useRef<string>('');
  const rawBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const firstKeyTimeRef = useRef<number>(0);
  const autoCommitTimerRef = useRef<number | null>(null);
  const inputSnapshotRef = useRef<{
    element: HTMLInputElement | HTMLTextAreaElement | null;
    valueBeforeBurst: string;
  }>({ element: null, valueBeforeBurst: '' });

  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    const clearAutoCommit = () => {
      if (autoCommitTimerRef.current !== null) {
        window.clearTimeout(autoCommitTimerRef.current);
        autoCommitTimerRef.current = null;
      }
    };

    const restoreFocusedInputIfPolluted = () => {
      const snap = inputSnapshotRef.current;
      if (!snap.element) return;
      const el = snap.element;
      if (el.getAttribute('data-barcode-input') === 'true') return;

      // Visszaállítjuk az input mező eredeti értékét, ha a szkenner első 1-2 karaktere belecsúszott
      if (el.value !== snap.valueBeforeBurst) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set;
        if (nativeInputValueSetter && el instanceof HTMLInputElement) {
          nativeInputValueSetter.call(el, snap.valueBeforeBurst);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          el.value = snap.valueBeforeBurst;
        }
      }
      inputSnapshotRef.current = { element: null, valueBeforeBurst: '' };
    };

    const commitScan = () => {
      clearAutoCommit();
      const raw = rawBufferRef.current;
      const candidate = bufferRef.current;
      bufferRef.current = '';
      rawBufferRef.current = '';

      const normalized = normalizeScannedCode(candidate);
      if (normalized.length >= minLength) {
        restoreFocusedInputIfPolluted();
        onScanRef.current(normalized, raw);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isDedicatedBarcodeInput =
        target?.getAttribute?.('data-barcode-input') === 'true';

      // Ha a dedikált manuális vonalkód inputban gépel/szkennel, hagyjuk a saját form submitját működni,
      // kivéve ha nem fókuszált, vagy ha globálisan kezeljük
      if (isDedicatedBarcodeInput) {
        return;
      }

      const isTextInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        Boolean(target?.isContentEditable);

      const now = performance.now();
      const elapsed = now - lastKeyTimeRef.current;

      // Lezáró karakterek: Enter vagy Tab (2D QR olvasóknál gyakori a Tab vagy CR/LF)
      if (e.key === 'Enter' || e.key === 'Tab') {
        const totalDuration = now - firstKeyTimeRef.current;
        const avgInterval =
          bufferRef.current.length > 1
            ? totalDuration / (bufferRef.current.length - 1)
            : elapsed;

        if (
          bufferRef.current.length >= minLength &&
          elapsed <= maxIntervalMs * 3.5 &&
          avgInterval <= maxIntervalMs
        ) {
          e.preventDefault();
          e.stopPropagation();
          commitScan();
          return;
        }

        clearAutoCommit();
        bufferRef.current = '';
        rawBufferRef.current = '';
        inputSnapshotRef.current = { element: null, valueBeforeBurst: '' };
        return;
      }

      // Modifier gombokat (Shift, CapsLock, AltGraph) figyelmen kívül hagyjuk, hogy ne törjék meg a burstöt
      if (
        e.key === 'Shift' ||
        e.key === 'CapsLock' ||
        e.key === 'AltGraph' ||
        e.key === 'Control' ||
        e.key === 'Alt'
      ) {
        return;
      }

      const resolvedChar = resolveScannerChar(e);
      if (resolvedChar !== null) {
        if (elapsed > maxIntervalMs || bufferRef.current.length === 0) {
          bufferRef.current = resolvedChar;
          rawBufferRef.current = e.key;
          firstKeyTimeRef.current = now;

          if (
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement
          ) {
            inputSnapshotRef.current = {
              element: target,
              valueBeforeBurst: target.value,
            };
          } else {
            inputSnapshotRef.current = { element: null, valueBeforeBurst: '' };
          }
        } else {
          bufferRef.current += resolvedChar;
          rawBufferRef.current += e.key;

          // Ha már legalább 2 gyors gépi karakter érkezett, blokkoljuk a beírást bármilyen fókuszált mezőbe is!
          if (bufferRef.current.length >= 2) {
            e.preventDefault();
            e.stopPropagation();
            if (isTextInput) {
              restoreFocusedInputIfPolluted();
            }
          }
        }

        lastKeyTimeRef.current = now;

        // Ha a 2D QR-olvasó nem küld Enter-t a végén, de egy gyors gépi sorozat (legalább 6 karakter) befejeződött:
        clearAutoCommit();
        if (bufferRef.current.length >= Math.max(minLength, 6)) {
          autoCommitTimerRef.current = window.setTimeout(() => {
            const burstDuration =
              lastKeyTimeRef.current - firstKeyTimeRef.current;
            const avg =
              bufferRef.current.length > 1
                ? burstDuration / (bufferRef.current.length - 1)
                : 999;
            if (avg <= maxIntervalMs * 0.85) {
              commitScan();
            } else {
              bufferRef.current = '';
              rawBufferRef.current = '';
            }
          }, autoCommitTimeoutMs);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      clearAutoCommit();
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [enabled, maxIntervalMs, minLength, autoCommitTimeoutMs]);
}
