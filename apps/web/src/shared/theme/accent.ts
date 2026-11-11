// Kiemelő szín (UI-specifikáció 3.4, tokens.md): a `--primary` futásidőben állítható, a
// `--primary-foreground` a WCAG relatív fényességből számolódik (fekete vagy fehér felirat).
// A Vendégmonitorra nem hat: ott fix színek vannak, nem a `--primary`.

export const DEFAULT_ACCENT = '#0f766e';

export const ACCENT_PRESETS = [
  { hex: '#0f766e', name: 'Kékeszöld' },
  { hex: '#1d4ed8', name: 'Kék' },
  { hex: '#4338ca', name: 'Indigó' },
  { hex: '#9d174d', name: 'Bordó' },
  { hex: '#b45309', name: 'Borostyán' },
  { hex: '#3f6212', name: 'Olajzöld' },
  { hex: '#334155', name: 'Palaszürke' },
  { hex: '#111827', name: 'Fekete' },
] as const;

const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

export function isAccentHex(value: string): boolean {
  return HEX_PATTERN.test(value);
}

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

/** `#0f766e` → `175 77% 26%` (shadcn HSL-számhármas). */
function hexToHslTriplet(hex: string): string {
  const [r, g, b] = channels(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h =
      max === r
        ? (g - b) / d + (g < b ? 6 : 0)
        : max === g
          ? (b - r) / d + 2
          : (r - g) / d + 4;
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** WCAG relatív fényesség (0 = fekete, 1 = fehér). */
function relativeLuminance(hex: string): number {
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const [r, g, b] = channels(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Kontrasztarány fehér háttéren; 3:1 alatt a Beállítások figyelmeztet (a mentést nem tiltja). */
export function contrastOnWhite(hex: string): number {
  return 1.05 / (relativeLuminance(hex) + 0.05);
}

/** A kiemelő színen olvasható felirat: világos színen sötét, sötéten fehér. */
function foregroundFor(hex: string): string {
  return relativeLuminance(hex) > 0.179 ? '222 47% 11%' : '0 0% 100%';
}

/** A `--primary` és a `--primary-foreground` beállítása a `<html>`-en. */
export function applyAccent(
  hex: string,
  root: HTMLElement = document.documentElement,
) {
  const safeHex = isAccentHex(hex) ? hex : DEFAULT_ACCENT;
  root.style.setProperty('--primary', hexToHslTriplet(safeHex));
  root.style.setProperty('--primary-foreground', foregroundFor(safeHex));
}
