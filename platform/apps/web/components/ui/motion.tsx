'use client';

import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Premium motion primitives (Chaya One).
 *
 * A small, reusable layer over Framer Motion so every dashboard surface shares
 * the same entrance feel: fade + 30px rise, ~600ms, cubic-bezier(.25,.8,.25,1),
 * with a 0.1s cascade between siblings. Everything honours
 * `prefers-reduced-motion` (renders final state instantly, no transform).
 */
export const EASE = [0.25, 0.8, 0.25, 1] as const;

/** Single element entrance. `delay` staggers manually-placed siblings. */
export function Reveal({ children, delay = 0, y = 30, className, style }: { children: ReactNode; delay?: number; y?: number; className?: string; style?: React.CSSProperties }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      style={style}
      initial={reduce ? false : { opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.04 } } };
const item: Variants = { hidden: { opacity: 0, y: 30 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } } };

/** Wrap a group; direct `StaggerItem` children cascade in. Keeps layout classes. */
export function Stagger({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className} style={style}>{children}</div>;
  return (
    <motion.div className={className} style={style} variants={container} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className} style={style}>{children}</div>;
  return <motion.div className={className} style={style} variants={item}>{children}</motion.div>;
}

/**
 * Count a number up from its previous value with requestAnimationFrame
 * (easeOutCubic). Never flashes the final value instantly unless reduced motion.
 */
export function CountUp({ value, format = (n) => n.toLocaleString('en-IN'), duration = 1200, className, style }: { value: number; format?: (n: number) => string; duration?: number; className?: string; style?: React.CSSProperties }) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduce) { setDisplay(value); fromRef.current = value; return; }
    const from = fromRef.current;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else { fromRef.current = value; setDisplay(value); }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value, duration, reduce]);

  return <span className={className} style={style}>{format(Math.round(display))}</span>;
}
