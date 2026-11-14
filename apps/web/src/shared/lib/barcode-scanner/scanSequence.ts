/**
 * Kézi gépelés és gépi (szkenner) billentyűsorozat szétválasztása (TICKET-5).
 *
 * Szövegmezőben a hook nem nyeli el menet közben a leütéseket, csak utólag dönt:
 * ha a sorozat egyértelműen gépi, beolvasásként kezeli és visszaállítja a mezőt.
 * Egy gyors kézi gépelő átlagosan 60–150 ms-onként üt le, a HID szkenner 5–20 ms-onként.
 */

export interface MachineSequenceOptions {
  /** Ennyi karakter alatt sosem beolvasás. */
  minLength?: number;
  /** A leütések közötti átlagos idő felső határa (ms, kizárólagos). */
  maxAvgIntervalMs?: number;
  /** Két szomszédos leütés közötti legnagyobb megengedett szünet (ms). */
  maxGapMs?: number;
}

export const MACHINE_SEQUENCE_DEFAULTS: Required<MachineSequenceOptions> = {
  minLength: 6,
  maxAvgIntervalMs: 30,
  maxGapMs: 80,
};

/**
 * Igaz, ha a karakterleütések időbélyegei (ms, növekvő sorrendben) egyértelműen gépi
 * sorozatot írnak le: elég hosszú, egyetlen szünet sem túl nagy, és az átlag gyorsabb,
 * mint amire ember képes.
 */
export function isMachineKeySequence(
  timestamps: readonly number[],
  options: MachineSequenceOptions = {},
): boolean {
  const { minLength, maxAvgIntervalMs, maxGapMs } = {
    ...MACHINE_SEQUENCE_DEFAULTS,
    ...options,
  };
  if (timestamps.length < Math.max(minLength, 2)) return false;

  for (let i = 1; i < timestamps.length; i += 1) {
    const gap = timestamps[i] - timestamps[i - 1];
    if (gap < 0 || gap > maxGapMs) return false;
  }

  const avg =
    (timestamps[timestamps.length - 1] - timestamps[0]) /
    (timestamps.length - 1);
  return avg < maxAvgIntervalMs;
}

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

export type EditableField = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

/** Szerkeszthető-e az elem (szöveges input, textarea vagy contenteditable). */
export function isEditableElement(
  target: EventTarget | null,
): target is EditableField {
  if (target instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has(target.type);
  }
  if (target instanceof HTMLTextAreaElement) return true;
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const contentEditable = target.getAttribute('contenteditable');
  return (
    contentEditable === '' ||
    contentEditable === 'true' ||
    contentEditable === 'plaintext-only'
  );
}

/**
 * Mezőszintű kikapcsolás: a `data-barcode-ignore` attribútumú elemen (vagy azon belül)
 * a szkenner-figyelő semmit nem csinál, a leütések változatlanul a mezőbe mennek.
 * `data-barcode-ignore="false"` visszakapcsolja.
 */
export function isBarcodeIgnored(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const host = target.closest('[data-barcode-ignore]');
  return host !== null && host.getAttribute('data-barcode-ignore') !== 'false';
}

export interface FieldSnapshot {
  element: EditableField;
  value: string;
  selectionStart: number | null;
  selectionEnd: number | null;
}

/** A mező állapota egy sorozat első leütése előtt (contenteditable esetén az innerHTML). */
export function takeFieldSnapshot(element: EditableField): FieldSnapshot {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    let selectionStart: number | null = null;
    let selectionEnd: number | null = null;
    try {
      selectionStart = element.selectionStart;
      selectionEnd = element.selectionEnd;
    } catch {
      // Egyes típusoknál (pl. number, email) a kijelölés nem olvasható.
    }
    return { element, value: element.value, selectionStart, selectionEnd };
  }
  return {
    element,
    value: element.innerHTML,
    selectionStart: null,
    selectionEnd: null,
  };
}

/**
 * React-kompatibilis értékadás: a natív `value` settert hívja (így a React értékkövetője
 * változást lát), majd `input` eseményt küld, amire a vezérelt mező `onChange`-e lefut.
 * Igazat ad, ha az érték ténylegesen változott.
 */
export function setFieldValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): boolean {
  if (element.value === value) return false;
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) {
    setter.call(element, value);
  } else {
    element.value = value;
  }
  element.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

/** A beolvasás előtti állapot visszaállítása: a szkennelt karakterek kikerülnek a mezőből. */
export function restoreFieldSnapshot(snapshot: FieldSnapshot): void {
  const { element } = snapshot;
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    setFieldValue(element, snapshot.value);
    if (snapshot.selectionStart !== null && snapshot.selectionEnd !== null) {
      try {
        element.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
      } catch {
        // Kijelölés nélküli inputtípus.
      }
    }
    return;
  }
  if (element.innerHTML !== snapshot.value) {
    element.innerHTML = snapshot.value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
