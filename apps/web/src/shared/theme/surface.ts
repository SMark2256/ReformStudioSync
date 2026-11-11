// Felületszín (UI-specifikáció 3.4, tokens.md): kész paletták világos és sötét árnyalattal. A
// `<html>` `data-surface` attribútuma választja ki őket (`app/styles/index.css`); a paletta adja
// a `--primary`-t, a fókuszgyűrűt, a halvány kiemelést és az oldalsáv kiemelését. A
// Vendégmonitorra nem hat: ott fix színek vannak, nem a `--primary`.

export const SURFACE_COLORS = [
  { id: 'teal', name: 'Kékeszöld', legacyHex: '#0f766e' },
  { id: 'blue', name: 'Kék', legacyHex: '#1d4ed8' },
  { id: 'indigo', name: 'Indigó', legacyHex: '#4338ca' },
  { id: 'burgundy', name: 'Bordó', legacyHex: '#9d174d' },
  { id: 'amber', name: 'Borostyán', legacyHex: '#b45309' },
  { id: 'olive', name: 'Olajzöld', legacyHex: '#3f6212' },
] as const;

export type SurfaceColor = (typeof SURFACE_COLORS)[number]['id'];

export const DEFAULT_SURFACE: SurfaceColor = 'teal';

export function isSurfaceColor(value: unknown): value is SurfaceColor {
  return SURFACE_COLORS.some((color) => color.id === value);
}

export function getSurfaceName(surface: SurfaceColor): string {
  return SURFACE_COLORS.find((color) => color.id === surface)?.name ?? '';
}

/**
 * A korábbi kiemelő szín (hexa, TICKET-21) megfelelője: ha a mentett szín egy preset volt, az
 * annak megfelelő paletta, különben az alapértelmezett. Az `index.html` inline scriptje
 * ugyanezt a hozzárendelést használja.
 */
export function surfaceFromLegacyAccent(hex: unknown): SurfaceColor {
  const match = SURFACE_COLORS.find(
    (color) => typeof hex === 'string' && color.legacyHex === hex.toLowerCase(),
  );
  return match?.id ?? DEFAULT_SURFACE;
}
