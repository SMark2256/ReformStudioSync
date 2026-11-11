import { domAnimation, LazyMotion, m, useReducedMotion } from 'motion/react';
import React, { useEffect, useMemo, useState } from 'react';

/** A robbanás teljes hossza; utána a komponens semmit nem renderel. */
export const BIRTHDAY_CONFETTI_MS = 2000;

/** Ünnepi színek, amelyek a smaragd/teal monitor-háttéren is jól látszanak. */
const COLORS = [
  '#fde047',
  '#fbbf24',
  '#f472b6',
  '#fb7185',
  '#a78bfa',
  '#38bdf8',
  '#ffffff',
];

/** Mintavételi pontok a röppálya mentén (lineáris szakaszok = parabola közelítése). */
const STEPS = 8;

interface Particle {
  color: string;
  width: number;
  height: number;
  round: boolean;
  x: number[];
  y: number[];
  rotate: number[];
  delay: number;
}

const random = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * Egy részecske röppályája: véletlen irányú kezdősebesség (inkább felfelé),
 * majd a gravitáció lefelé húzza. `spread` a kijelző méretéhez skáláz.
 */
function createParticle(spread: number): Particle {
  const angle = random(-Math.PI * 0.95, -Math.PI * 0.05);
  const speed = random(0.45, 1) * spread;
  const vx = Math.cos(angle) * speed;
  const vy = Math.sin(angle) * speed;
  const gravity = spread * 2.4;
  const spin = random(-720, 720);
  const times = Array.from({ length: STEPS }, (_, i) => i / (STEPS - 1));
  const size = random(0.6, 1.2) * (spread / 40);
  const round = Math.random() < 0.3;

  return {
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    width: size,
    height: round ? size : size * random(0.4, 0.7),
    round,
    x: times.map((t) => vx * t),
    y: times.map((t) => vy * t + 0.5 * gravity * t * t),
    rotate: times.map((t) => spin * t),
    delay: random(0, 0.12),
  };
}

interface BirthdayConfettiProps {
  /** Előnézeti (kicsinyített) kártyán kevesebb és kisebb részecske. */
  compact?: boolean;
}

/**
 * Születésnapi konfetti-robbanás a Vendégmonitor kártyája fölött. Egyszer fut le
 * (új lejátszáshoz új `key` kell), `BIRTHDAY_CONFETTI_MS` után eltűnik.
 * Csak transform és opacity animálódik; csökkentett mozgásnál nem jelenik meg.
 */
export const BirthdayConfetti: React.FC<BirthdayConfettiProps> = ({
  compact = false,
}) => {
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(true);

  const particles = useMemo(() => {
    const count = compact ? 40 : 80;
    const spread = compact ? 260 : 640;
    return Array.from({ length: count }, () => createParticle(spread));
  }, [compact]);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), BIRTHDAY_CONFETTI_MS);
    return () => clearTimeout(timer);
  }, []);

  if (reduceMotion || !visible) return null;

  const duration = BIRTHDAY_CONFETTI_MS / 1000 - 0.15;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <LazyMotion features={domAnimation} strict>
        {particles.map((p, i) => (
          <m.span
            key={i}
            className="absolute left-1/2 top-[38%]"
            style={{
              width: p.width,
              height: p.height,
              marginLeft: -p.width / 2,
              marginTop: -p.height / 2,
              backgroundColor: p.color,
              borderRadius: p.round ? '50%' : 1,
            }}
            initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
            animate={{
              x: p.x,
              y: p.y,
              rotate: p.rotate,
              opacity: [1, 1, 1, 1, 1, 0.8, 0.4, 0],
            }}
            transition={{ duration, delay: p.delay, ease: 'linear' }}
          />
        ))}
      </LazyMotion>
    </div>
  );
};
