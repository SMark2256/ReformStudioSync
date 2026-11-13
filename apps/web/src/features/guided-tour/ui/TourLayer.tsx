import { ArrowRight } from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Button } from '@/shared/ui';
import { findTarget, type TourStep } from '../config/tours';
import { prefersReducedMotion } from '../lib/environment';
import './tour-layer.css';

// Az oldalbemutató rétege (a Színlap „színpadi reflektorának” mintájára): a kurzor ívben a
// bemutatott elemhez siklik és koppint, a többi elsötétül, a buborék magyaráz. Csak induláskor
// töltődik be (PageTour, React.lazy), a body-ba portálva.

const MARGIN = 16;
const GAP = 14;
const PAD = 8;
const CURSOR = 28;
/** A kurzor hegye az SVG-ben (a 24-es nézetdoboz 5, 3 pontja). */
const TIP = { x: (5 * CURSOR) / 24, y: (3 * CURSOR) / 24 };
/** A rögzített sávok (fejléc, oldalsáv) jelölése az alkalmazáskeretben. */
const BAR = '[data-tour-bar]';

/** `r`: a reflektor sarka a célpont saját lekerekítéséhez igazodik. */
type Box = { x: number; y: number; w: number; h: number; r: number };
type Point = { x: number; y: number };
type Layout = {
  spot: Box | null;
  /** A kurzor bal felső sarka (a hegye `TIP`-pel beljebb). */
  cursor: Point;
  bubble: { x: number; y: number; w: number };
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, Math.max(min, max)));

/**
 * A célpont kiemelt területe. A menü- és fülsorok (`nav`, fülsor) tárolója gyakran a teljes
 * szélességet kitölti: ezeknél a reflektor csak a bennük lévő gombokat és linkeket fogja körül.
 */
function controlsRect(target: HTMLElement) {
  const box = target.getBoundingClientRect();
  if (!target.matches('nav, [role="tablist"]')) return box;
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const control of target.querySelectorAll('a, button')) {
    const r = control.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    left = Math.min(left, r.left);
    top = Math.min(top, r.top);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  }
  return right > left ? { left, top, right, bottom } : box;
}

/** A reflektor: a célpont körül `PAD`-del, de a rögzített sávból (fejléc, oldalsáv) nem lóg ki. */
function spotOf(target: HTMLElement): Box {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const r = controlsRect(target);
  // A sáv mögötti oldal világos csíkként látszana a sávbeli elem mellett.
  const bar = target.closest(BAR)?.getBoundingClientRect();
  const x = Math.max(r.left - PAD, bar?.left ?? 4, 4);
  const y = Math.max(r.top - PAD, bar?.top ?? 4, 4);
  const radius =
    Number.parseFloat(getComputedStyle(target).borderTopLeftRadius) || 0;
  return {
    x,
    y,
    w: Math.min(r.right + PAD, bar?.right ?? vw - 4, vw - 4) - x,
    h: Math.min(r.bottom + PAD, bar?.bottom ?? vh - 4, vh - 4) - y,
    r: radius ? Math.min(radius + PAD / 2, 20) : 10,
  };
}

/**
 * A kurzor hegye a célponton (kis elemnél a közepén, kártyánál a fejlécében), a buborék a célpont
 * mellett, alatt vagy fölött, ahol elfér; ha sehol, a célponttal átellenes oldalon rátakar.
 * Célpont nélkül a buborék középen, a kurzor mellette.
 */
function place(target: HTMLElement | null, bh: number): Layout {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const wide = vw >= 768;
  const w = Math.min(360, vw - 2 * MARGIN);

  if (!target) {
    const x = (vw - w) / 2;
    const y = clamp(vh / 2 - bh / 2, MARGIN + CURSOR, vh - MARGIN - bh);
    return {
      spot: null,
      cursor: wide
        ? { x: x + w + GAP, y: y + 12 }
        : { x: x + w - CURSOR - 12, y: y - CURSOR - 4 },
      bubble: { x, y, w },
    };
  }

  const s = spotOf(target);
  const cursor = {
    x: s.x + s.w / 2 - TIP.x,
    y: s.y + Math.min(s.h / 2, 32) - TIP.y,
  };
  const alignX = wide ? clamp(s.x, MARGIN, vw - MARGIN - w) : (vw - w) / 2;
  const alignY = clamp(s.y, MARGIN, vh - MARGIN - bh);
  let bubble: Point;
  if (wide && s.x + s.w + GAP + w <= vw - MARGIN) {
    bubble = { x: s.x + s.w + GAP, y: alignY };
  } else if (wide && s.x - GAP - w >= MARGIN) {
    bubble = { x: s.x - GAP - w, y: alignY };
  } else if (s.y + s.h + GAP + bh <= vh - MARGIN) {
    bubble = { x: alignX, y: s.y + s.h + GAP };
  } else if (s.y - GAP - bh >= MARGIN) {
    bubble = { x: alignX, y: s.y - GAP - bh };
  } else {
    const below = s.y + s.h / 2 < vh / 2;
    bubble = {
      x: wide ? vw - MARGIN - w : (vw - w) / 2,
      y: below ? vh - MARGIN - bh : MARGIN,
    };
  }
  return { spot: s, cursor, bubble: { ...bubble, w } };
}

/** Egérmutató (a hegye a nézetdoboz 5, 3 pontjában). */
const CursorIcon: React.FC = () => (
  <svg
    width={CURSOR}
    height={CURSOR}
    viewBox="0 0 24 24"
    aria-hidden
    className="block fill-primary stroke-primary-foreground"
    strokeWidth={1.5}
    strokeLinejoin="round"
  >
    <path d="M5 3v16.5l4.6-4.4 2.9 6.6 2.9-1.3-2.9-6.5H19L5 3z" />
  </svg>
);

interface TourLayerProps {
  steps: TourStep[];
  /** `all`: „Többet ne mutass bemutatót”; `step`: ahol bezárta (a végignézettnél a lépések száma). */
  onClose: (all: boolean, step: number) => void;
}

const TourLayer: React.FC<TourLayerProps> = ({ steps, onClose }) => {
  const [index, setIndex] = useState(0);
  const [state, setState] = useState<'opening' | 'open' | 'closing'>(
    'opening',
  );
  // A hely, a buborék magassága és a lépés, amelyhez kiszámoltuk.
  const [layout, setLayout] = useState<
    (Layout & { height: number; step: number }) | null
  >(null);
  // Hosszú úton a buborék elhalványul, és csak érkezéskor jelenik meg újra; rövidnél a helyén csúszik.
  const [far, setFar] = useState(false);
  // A koppintás hulláma: a lépés, amelynél a kurzor megérkezett.
  const [tapped, setTapped] = useState<number | null>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const flown = useRef<(Point & { step: number }) | null>(null);
  const flight = useRef<Animation | null>(null);
  const [reduce] = useState(prefersReducedMotion);
  const titleId = useId();
  const textId = useId();
  const step = steps[index];
  const last = index === steps.length - 1;

  // A buborék magassága, amellyel a helyét utoljára kiszámoltuk.
  const placedHeight = useRef(200);
  const measure = useCallback(() => {
    placedHeight.current = bubble.current?.offsetHeight || placedHeight.current;
    setLayout({
      ...place(findTarget(step.target), placedHeight.current),
      height: placedHeight.current,
      step: index,
    });
  }, [step.target, index]);

  // Lépésváltáskor a célpont a képernyőre gördül, utána mérünk.
  useLayoutEffect(() => {
    const target = findTarget(step.target);
    if (target) {
      const r = target.getBoundingClientRect();
      if (r.top < 80 || r.bottom > window.innerHeight - 80) {
        target.scrollIntoView({
          block: r.height > window.innerHeight * 0.6 ? 'start' : 'center',
          behavior: 'instant',
        });
      }
    }
    measure();
  }, [measure, step.target]);

  // A buborék magassága a szövegtől függ: a megjelenése után újramérünk.
  useLayoutEffect(() => {
    const height = bubble.current?.offsetHeight;
    if (height && height !== placedHeight.current) measure();
  });

  // Átméretezéskor és görgetéskor (bármelyik görgethető tárolóban) újramérünk.
  useEffect(() => {
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, { passive: true, capture: true });
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, { capture: true });
    };
  }, [measure]);

  // A kurzor útja lépésváltáskor: ívben az új helyére, érkezéskor koppint. Görgetéskor és
  // átméretezéskor a helyére ugrik. Az első lépésnél a képernyő jobb széléről úszik be.
  const cx = layout?.cursor.x;
  const cy = layout?.cursor.y;
  const placedFor = layout?.height;
  const placedStep = layout?.step;
  useLayoutEffect(() => {
    const element = cursor.current;
    if (cx === undefined || cy === undefined || !element) return;
    // Elavult hely: az előző lépésé, vagy azóta változott a buborék magassága.
    if (placedStep !== index) return;
    if (bubble.current && bubble.current.offsetHeight !== placedFor) return;
    const to = { x: cx, y: cy };
    const from = flown.current;
    flown.current = { ...to, step: index };
    element.style.transform = `translate(${to.x}px, ${to.y}px)`;
    if (from?.step === index || reduce) return;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const start = from ?? { x: vw + 24, y: clamp(to.y + 120, MARGIN, vh - CURSOR) };
    const dx = to.x - start.x;
    const dy = to.y - start.y;
    const distance = Math.hypot(dx, dy);
    const tap = () => {
      setTapped(index);
      element.firstElementChild?.animate(
        [{ scale: 1 }, { scale: 0.82 }, { scale: 1 }],
        { duration: 280, easing: 'ease-out' },
      );
    };
    if (distance < 24) {
      tap();
      return;
    }
    // Lágy ív (másodfokú Bézier-görbe sűrű kulcskockákkal): vízszintes útnál enyhén fölfelé,
    // függőlegesnél a képernyő közepe felé hajlik; sosem lóg ki a képernyőről.
    const bow = Math.min(72, distance * 0.18);
    const normal = { x: -dy / distance, y: dx / distance };
    const sign =
      Math.abs(dx) >= Math.abs(dy)
        ? normal.y > 0
          ? -1
          : 1
        : normal.x * (vw / 2 - to.x) > 0
          ? 1
          : -1;
    const control = {
      x: clamp((start.x + to.x) / 2 + normal.x * bow * sign, MARGIN, vw - MARGIN - CURSOR),
      y: clamp((start.y + to.y) / 2 + normal.y * bow * sign, MARGIN, vh - CURSOR),
    };
    const keyframes = Array.from({ length: 17 }, (_, i) => {
      const t = i / 16;
      const x = (1 - t) ** 2 * start.x + 2 * (1 - t) * t * control.x + t ** 2 * to.x;
      const y = (1 - t) ** 2 * start.y + 2 * (1 - t) * t * control.y + t ** 2 * to.y;
      return { transform: `translate(${x}px, ${y}px)` };
    });
    // Gyors léptetésnél az előző út megszakad (a jelzései nélkül), az új az előző céljából indul.
    const previous = flight.current;
    if (previous) {
      previous.onfinish = previous.oncancel = null;
      previous.cancel();
    }
    // A fénnyel (reflektor, csóva, vignetta) azonos ütemben és görbével (tour-layer.css).
    const animation = element.animate(keyframes, {
      duration: clamp(520 + distance * 0.35, 560, 900),
      easing: 'cubic-bezier(0.33, 0, 0.2, 1)',
    });
    flight.current = animation;
    setFar(distance > 160);
    setTapped(null);
    animation.onfinish = () => {
      setFar(false);
      tap();
    };
    animation.oncancel = () => setFar(false);
  }, [cx, cy, placedFor, placedStep, index, reduce]);

  // Nyitáskor áttűnés; bezáráskor a fókusz visszaáll oda, ahol előtte volt (ha az még az oldalon
  // van, pl. a „?” gomb; a felajánló kártya addigra eltűnik, akkor a tartalomra).
  useEffect(() => {
    const frame = requestAnimationFrame(() => setState('open'));
    const previous = document.activeElement as HTMLElement | null;
    return () => {
      cancelAnimationFrame(frame);
      const back = previous?.isConnected
        ? previous
        : document.getElementById('main');
      back?.focus({ preventScroll: true });
    };
  }, []);

  // A fókusz a buborék fő gombjára kerül (lépésenként is).
  useEffect(() => {
    primary.current?.focus({ preventScroll: true });
  }, [index]);

  const close = (all = false, done = false) => {
    if (state === 'closing') return;
    setState('closing');
    // A végignézett bemutató lépésszáma a lépések száma: így elválik a kihagyástól.
    const at = done ? steps.length : index;
    window.setTimeout(() => onClose(all, at), reduce ? 0 : 280);
  };
  const go = (next: number) => {
    if (next >= steps.length) {
      close(false, true);
      return;
    }
    setIndex(Math.max(0, next));
  };

  // Billentyűk az egész oldalon (a bemutató alatt az oldal nem kezelhető): Esc kihagy, a nyilak
  // léptetnek, a Tab a buborékon belül marad. A szkenner figyelését nem veszi el (nincs
  // `stopPropagation`).
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'ArrowRight') {
      go(index + 1);
    } else if (event.key === 'ArrowLeft') {
      go(index - 1);
    } else if (event.key === 'Tab') {
      const items = [
        ...(bubble.current?.querySelectorAll<HTMLElement>('button') ?? []),
      ];
      const first = items[0];
      const final = items[items.length - 1];
      if (!bubble.current?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? final : first)?.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        final?.focus();
      } else if (!event.shiftKey && document.activeElement === final) {
        event.preventDefault();
        first?.focus();
      }
    }
  };
  const latestKey = useRef(onKey);
  useLayoutEffect(() => {
    latestKey.current = onKey;
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => latestKey.current(event);
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, []);

  // A fény: a célpont körüli reflektor, fölötte a képernyő tetejéről eső fénycsóva, körben
  // vignetta. Lépésváltás közben (hosszú út) a csóva keskeny sugárrá szűkül.
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const lit = layout?.spot;
  const center = lit
    ? { x: lit.x + lit.w / 2, y: lit.y + lit.h / 2, r: Math.max(lit.w, lit.h) / 2 + 48 }
    : { x: vw / 2, y: vh / 2, r: Math.min(vw, vh) * 0.32 };
  const beam = lit && lit.y > 48 ? (far ? 0.22 : 1) : 0;
  const cone =
    lit &&
    `polygon(${center.x - 18 - lit.w * 0.06 * beam}px 0, ${center.x + 18 + lit.w * 0.06 * beam}px 0, ${center.x + (lit.w / 2) * Math.max(beam, 0.22)}px ${lit.y + lit.h * 0.35}px, ${center.x - (lit.w / 2) * Math.max(beam, 0.22)}px ${lit.y + lit.h * 0.35}px)`;
  const tip = layout && { x: layout.cursor.x + TIP.x, y: layout.cursor.y + TIP.y };

  return (
    <div
      className="tour-layer"
      data-state={state}
      data-moving={far ? '' : undefined}
    >
      {lit ? (
        <div
          className="tour-spot"
          style={{
            left: lit.x,
            top: lit.y,
            width: lit.w,
            height: lit.h,
            borderRadius: lit.r,
          }}
        />
      ) : (
        <div
          data-empty
          className="tour-spot"
          style={{ left: '50%', top: '50%', width: 0, height: 0 }}
        />
      )}
      <div
        aria-hidden
        className="tour-vignette"
        style={
          {
            '--tour-cx': `${center.x}px`,
            '--tour-cy': `${center.y}px`,
            '--tour-r': `${center.r}px`,
          } as React.CSSProperties
        }
      />
      {cone && (
        <div aria-hidden className="tour-cone" data-off={beam ? undefined : ''}>
          <div style={{ clipPath: cone }} />
        </div>
      )}
      {lit && tip && tapped === index && (
        <span
          key={index}
          aria-hidden
          className="tour-tap"
          style={{ left: tip.x, top: tip.y }}
        />
      )}
      <div
        ref={cursor}
        aria-hidden
        className="tour-cursor"
        style={{ opacity: layout ? undefined : 0 }}
      >
        <CursorIcon />
      </div>
      <div
        ref={bubble}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
        data-tour-bubble
        className="tour-bubble flex flex-col gap-3 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg md:p-5"
        style={{
          left: layout?.bubble.x ?? -9999,
          top: layout?.bubble.y ?? 0,
          width: layout?.bubble.w ?? 360,
        }}
      >
        <p className="text-xs font-semibold tabular-nums text-muted-foreground">
          <span aria-hidden>
            {index + 1} / {steps.length}
          </span>
          <span className="sr-only">
            {index + 1}. lépés, összesen {steps.length}
          </span>
        </p>
        <div key={index} className="tour-step-in flex flex-col gap-1.5">
          <h2 id={titleId} className="text-base font-semibold text-foreground">
            {step.title}
          </h2>
          <p id={textId} className="text-sm leading-relaxed text-muted-foreground">
            {step.text}
          </p>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <Button
            variant="link"
            size="sm"
            className="text-muted-foreground"
            onClick={() => close()}
          >
            Kihagyás
          </Button>
          <span className="flex-1" />
          {index > 0 && (
            <Button size="sm" onClick={() => go(index - 1)}>
              Vissza
            </Button>
          )}
          <Button
            ref={primary}
            variant="primary"
            size="sm"
            onClick={() => go(index + 1)}
          >
            {last ? 'Kész' : 'Tovább'}
            {!last && <ArrowRight aria-hidden strokeWidth={1.75} />}
          </Button>
        </div>
        {index === 0 && (
          <Button
            variant="link"
            size="sm"
            className="self-start text-xs font-normal text-muted-foreground"
            onClick={() => close(true)}
          >
            Többet ne mutass bemutatót
          </Button>
        )}
      </div>
    </div>
  );
};

export default TourLayer;
