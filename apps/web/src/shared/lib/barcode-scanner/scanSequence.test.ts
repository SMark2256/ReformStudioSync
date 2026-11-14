import { act, cleanup, render } from '@testing-library/react';
import { createElement, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isBarcodeIgnored,
  isEditableElement,
  isMachineKeySequence,
  restoreFieldSnapshot,
  setFieldValue,
  takeFieldSnapshot,
} from './scanSequence';

/** `count` darab időbélyeg, egyenletesen `intervalMs` ms-onként. */
const evenly = (count: number, intervalMs: number, start = 1000): number[] =>
  Array.from({ length: count }, (_, i) => start + i * intervalMs);

/** Időbélyegek a megadott szünetekből. */
const fromGaps = (gaps: number[], start = 1000): number[] =>
  gaps.reduce<number[]>((acc, gap) => [...acc, acc[acc.length - 1] + gap], [
    start,
  ]);

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('isMachineKeySequence (TICKET-5)', () => {
  it('a HID szkenner sorozatát (8 ms / karakter) gépinek veszi', () => {
    expect(isMachineKeySequence(evenly(6, 8))).toBe(true);
    expect(isMachineKeySequence(evenly(24, 12))).toBe(true);
  });

  it('a csomagokban érkező Bluetooth-sorozatot is gépinek veszi', () => {
    // 4 karakteres csomagok 2 ms-on belül, köztük 45 ms szünet.
    const gaps = [2, 2, 2, 45, 2, 2, 2, 45, 2, 2, 2];
    expect(isMachineKeySequence(fromGaps(gaps))).toBe(true);
  });

  it('a gyors kézi gépelést (60 ms / karakter) nem veszi gépinek', () => {
    expect(isMachineKeySequence(evenly(12, 60))).toBe(false);
  });

  it('az átfedő leütéseket tartalmazó kézi gépelést sem veszi gépinek', () => {
    // Görgetett leütések: néhány 15–25 ms-os pár, de az átlag emberi.
    const gaps = [15, 90, 20, 110, 25, 70, 18, 95, 22];
    expect(isMachineKeySequence(fromGaps(gaps))).toBe(false);
  });

  it('6 karakternél rövidebb sorozat sosem beolvasás', () => {
    expect(isMachineKeySequence(evenly(5, 5))).toBe(false);
    expect(isMachineKeySequence([])).toBe(false);
    expect(isMachineKeySequence([1000])).toBe(false);
  });

  it('egy túl nagy szünet megszakítja a gépi sorozatot', () => {
    const gaps = [5, 5, 5, 5, 120, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
    expect(isMachineKeySequence(fromGaps(gaps))).toBe(false);
  });

  it('a határértékek a beállításokkal hangolhatók', () => {
    expect(isMachineKeySequence(evenly(6, 40))).toBe(false);
    expect(isMachineKeySequence(evenly(6, 40), { maxAvgIntervalMs: 45 })).toBe(
      true,
    );
    expect(isMachineKeySequence(evenly(4, 5), { minLength: 4 })).toBe(true);
  });
});

describe('isEditableElement', () => {
  it('a szöveges inputot, a textareát és a contenteditable elemet szerkeszthetőnek veszi', () => {
    const text = document.createElement('input');
    const date = Object.assign(document.createElement('input'), {
      type: 'date',
    });
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');

    expect(isEditableElement(text)).toBe(true);
    expect(isEditableElement(date)).toBe(true);
    expect(isEditableElement(document.createElement('textarea'))).toBe(true);
    expect(isEditableElement(editable)).toBe(true);
  });

  it('a gombot, a jelölőnégyzetet és a sima elemet nem', () => {
    const checkbox = Object.assign(document.createElement('input'), {
      type: 'checkbox',
    });
    expect(isEditableElement(checkbox)).toBe(false);
    expect(isEditableElement(document.createElement('button'))).toBe(false);
    expect(isEditableElement(document.body)).toBe(false);
    expect(isEditableElement(null)).toBe(false);
  });
});

describe('isBarcodeIgnored', () => {
  it('a data-barcode-ignore mezőn és a jelölt konténeren belül igaz', () => {
    document.body.innerHTML = `
      <input id="direct" data-barcode-ignore />
      <div data-barcode-ignore="true"><textarea id="nested"></textarea></div>
      <div data-barcode-ignore="false"><input id="off" /></div>
      <input id="plain" />
    `;
    expect(isBarcodeIgnored(document.getElementById('direct'))).toBe(true);
    expect(isBarcodeIgnored(document.getElementById('nested'))).toBe(true);
    expect(isBarcodeIgnored(document.getElementById('off'))).toBe(false);
    expect(isBarcodeIgnored(document.getElementById('plain'))).toBe(false);
    expect(isBarcodeIgnored(null)).toBe(false);
  });
});

describe('mező visszaállítása', () => {
  it('a pillanatkép visszaállítása kiveszi a szkennelt karaktereket, és input eseményt küld', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.value = 'Kov';
    input.setSelectionRange(3, 3);
    const snapshot = takeFieldSnapshot(input);

    input.value = 'Kov100001';
    const onInput = vi.fn();
    input.addEventListener('input', onInput);
    restoreFieldSnapshot(snapshot);

    expect(input.value).toBe('Kov');
    expect(input.selectionStart).toBe(3);
    expect(onInput).toHaveBeenCalledTimes(1);
  });

  it('textareánál is működik', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.value = 'Első sor';
    const snapshot = takeFieldSnapshot(textarea);
    textarea.value = 'Első sor984712';
    restoreFieldSnapshot(snapshot);
    expect(textarea.value).toBe('Első sor');
  });

  it('változatlan értéknél nem küld eseményt', () => {
    const input = document.createElement('input');
    input.value = 'abc';
    const onInput = vi.fn();
    input.addEventListener('input', onInput);
    expect(setFieldValue(input, 'abc')).toBe(false);
    expect(onInput).not.toHaveBeenCalled();
  });

  it('a React vezérelt mező állapota is visszaáll (natív setter + input esemény)', () => {
    let lastValue = '';
    const Controlled = () => {
      const [value, setValue] = useState('Kov100001');
      lastValue = value;
      return createElement('input', {
        'data-testid': 'field',
        value,
        onChange: (e: { target: HTMLInputElement }) => setValue(e.target.value),
      });
    };
    const { getByTestId } = render(createElement(Controlled));
    const input = getByTestId('field') as HTMLInputElement;

    act(() => {
      setFieldValue(input, 'Kov');
    });

    expect(lastValue).toBe('Kov');
    expect(input.value).toBe('Kov');
  });
});
