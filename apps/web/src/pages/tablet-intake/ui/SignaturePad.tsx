import { Eraser } from 'lucide-react';
import React, { useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { Button } from '@/shared/ui';

export interface SignaturePadHandle {
  /** PNG data URL; `null`, ha üres. */
  toDataUrl: () => string | null;
  clear: () => void;
}

// Sötét tinta fehér „papíron” mindkét témában: a PDF-be is így kerül.
const INK = '#111827';
const PAPER = '#ffffff';

/**
 * Érintőceruzás és ujjas aláírás (TICKET-56): Pointer Events, így a Lenovo tablet tolla, az
 * ujj és az egér is működik; a toll nyomása a vonalvastagságot finoman állítja. A vászon a
 * képsűrűséghez igazodik (éles vonal), és tájolásváltáskor újraméreteződik.
 */
export const SignaturePad = React.forwardRef<
  SignaturePadHandle,
  { label: string; onChange: (hasSignature: boolean) => void }
>(({ label, onChange }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const context = () => canvasRef.current?.getContext('2d') ?? null;

  /** Üres lap; `force` nélkül csak akkor, ha a vászon mérete tényleg változott. */
  const reset = useCallback((force: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    const pixelWidth = Math.max(1, Math.round(width * ratio));
    const pixelHeight = Math.max(1, Math.round(height * ratio));
    if (!force && canvas.width === pixelWidth && canvas.height === pixelHeight) return;
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const ctx = context();
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, width, height);
    // Átméretezéskor a vonal elveszne: tiszta lappal, újra alá kell írni.
    if (hasInk.current) {
      hasInk.current = false;
      onChange(false);
    }
  }, [onChange]);

  const clear = useCallback(() => reset(true), [reset]);

  useEffect(() => {
    clear();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => reset(false));
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [clear, reset]);

  useImperativeHandle(ref, () => ({
    toDataUrl: () => (hasInk.current ? canvasRef.current?.toDataURL('image/png') ?? null : null),
    clear,
  }));

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const handleDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    last.current = point(event);
  };

  const handleMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = context();
    if (!drawing.current || !ctx || !last.current) return;
    const next = point(event);
    const pressure = event.pointerType === 'pen' && event.pressure > 0 ? event.pressure : 0.5;
    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.5 + pressure * 2.5;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    last.current = next;
    if (!hasInk.current) {
      hasInk.current = true;
      onChange(true);
    }
  };

  const handleUp = () => {
    drawing.current = false;
    last.current = null;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <Button type="button" size="sm" onClick={clear}>
          <Eraser aria-hidden className="size-4" />
          Aláírás törlése
        </Button>
      </div>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`${label}: rajzold ide az aláírásod ujjal vagy érintőceruzával`}
        data-testid="signature-pad"
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onPointerLeave={handleUp}
        style={{ backgroundColor: PAPER }}
        className="block h-48 w-full touch-none rounded-md border border-input sm:h-56"
      />
    </div>
  );
});
SignaturePad.displayName = 'SignaturePad';
