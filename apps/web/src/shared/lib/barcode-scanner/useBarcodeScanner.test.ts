import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBarcodeScanner } from './useBarcodeScanner';

let clock = 0;

const codeFor = (ch: string): string =>
  /\d/.test(ch) ? `Digit${ch}` : /[a-z]/i.test(ch) ? `Key${ch.toUpperCase()}` : '';

/**
 * Leütés a böngészőhöz hasonlóan: keydown, és ha senki nem tiltotta le, a karakter
 * a fókuszált mezőbe kerül. Visszaadja, hogy a leütés el lett-e nyelve.
 */
const press = (target: HTMLElement, key: string, afterMs: number): boolean => {
  clock += afterMs;
  const event = new KeyboardEvent('keydown', {
    key,
    code: key.length === 1 ? codeFor(key) : key,
    bubbles: true,
    cancelable: true,
  });
  const notPrevented = target.dispatchEvent(event);
  if (
    notPrevented &&
    key.length === 1 &&
    (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)
  ) {
    target.value += key;
  }
  return !notPrevented;
};

const typeText = (target: HTMLElement, text: string, intervalMs: number) =>
  Array.from(text).map((ch) => press(target, ch, intervalMs));

const mountInput = (attrs: Record<string, string> = {}): HTMLInputElement => {
  const input = document.createElement('input');
  Object.entries(attrs).forEach(([name, value]) => input.setAttribute(name, value));
  document.body.appendChild(input);
  input.focus();
  return input;
};

describe('useBarcodeScanner (TICKET-5)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clock = 10_000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('gyors kézi gépelésnél (60 ms) egy karaktert sem nyel el, és nem indít beolvasást', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));
    const input = mountInput();

    const swallowed = typeText(input, 'Kovacs Anna1234', 60);
    const enterSwallowed = press(input, 'Enter', 60);
    vi.advanceTimersByTime(500);

    expect(swallowed.every((s) => !s)).toBe(true);
    expect(enterSwallowed).toBe(false);
    expect(input.value).toBe('Kovacs Anna1234');
    expect(onScan).not.toHaveBeenCalled();
  });

  it('fókuszált mezőben az Enterrel lezárt szkennelés beolvas, és nem szennyezi a mezőt', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));
    const input = mountInput();
    typeText(input, 'Kov', 150);

    clock += 300;
    typeText(input, '100001', 8);
    const enterSwallowed = press(input, 'Enter', 8);

    expect(enterSwallowed).toBe(true);
    expect(onScan).toHaveBeenCalledWith('100001', '100001');
    expect(input.value).toBe('Kov');
  });

  it('lezáró karakter nélküli szkennelést is felismer az időzítővel', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));
    const input = mountInput();

    typeText(input, '984712039481', 6);
    expect(onScan).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);

    expect(onScan).toHaveBeenCalledWith('984712039481', '984712039481');
    expect(input.value).toBe('');
  });

  it('data-barcode-ignore mezőben a gyors bevitel is a mezőben marad', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));
    const input = mountInput({ 'data-barcode-ignore': '' });

    typeText(input, '100001', 8);
    const enterSwallowed = press(input, 'Enter', 8);
    vi.advanceTimersByTime(200);

    expect(enterSwallowed).toBe(false);
    expect(input.value).toBe('100001');
    expect(onScan).not.toHaveBeenCalled();
  });

  it('fókusz nélkül a gyors sorozatot menet közben elnyeli, és beolvas', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner({ onScan }));

    const swallowed = typeText(document.body, '100001', 8);
    press(document.body, 'Enter', 8);

    expect(swallowed).toEqual([false, true, true, true, true, true]);
    expect(onScan).toHaveBeenCalledWith('100001', '100001');
  });
});
