"use client";

import {
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";

import styles from "./motion.module.css";

const EASE = [0.2, 0, 0, 1] as const;

/* ── Reveal: тихий подъём при попадании во вьюпорт ────────── */
export const Reveal = ({
  children,
  delay = 0,
  y = 18,
  className,
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: "div" | "section" | "li" | "span" | "header" | "article";
}) => {
  const reduce = useReducedMotion();
  const MotionTag = motion[as] as typeof motion.div;
  return (
    <MotionTag
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y }}
      whileInView={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-70px" }}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      {children}
    </MotionTag>
  );
};

/* ── MaskLine: строка заголовка, поднимающаяся из-под маски ── */
export const MaskLine = ({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) => {
  const reduce = useReducedMotion();
  return (
    <span style={{ display: "block", overflow: "hidden", paddingBottom: "0.04em" }} className={className}>
      <motion.span
        style={{ display: "inline-block" }}
        initial={reduce ? { opacity: 0 } : { y: "0.95em", opacity: 0 }}
        animate={reduce ? { opacity: 1 } : { y: 0, opacity: 1 }}
        transition={{ duration: 0.72, ease: EASE, delay }}
      >
        {children}
      </motion.span>
    </span>
  );
};

/* ── CountUp: число «набирается» при появлении ────────────── */
export const CountUp = ({
  value,
  format = (n) => String(Math.round(n)),
  duration = 1.3,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(() => format(reduce ? value : 0));

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setDisplay(format(value));
      return;
    }
    let raf = 0;
    let start = 0;
    const step = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / (duration * 1000));
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(format(value * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration, reduce, format]);

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
};

/* ── Marquee: бесконечная лента реестра ───────────────────── */
export const Marquee = ({
  children,
  durationSec = 46,
  reverse = false,
  className,
  ariaLabel,
}: {
  children: ReactNode;
  durationSec?: number;
  reverse?: boolean;
  className?: string;
  ariaLabel?: string;
}) => (
  <div className={`${styles.marquee} ${className ?? ""}`.trim()} role="marquee" aria-label={ariaLabel}>
    <div
      className={`${styles.track} ${reverse ? styles.trackReverse : ""}`}
      style={{ ["--marquee-dur" as string]: `${durationSec}s` }}
    >
      <span aria-hidden={false} style={{ display: "inline-flex", alignItems: "center" }}>
        {children}
      </span>
      <span aria-hidden style={{ display: "inline-flex", alignItems: "center" }}>
        {children}
      </span>
    </div>
  </div>
);

/* ── ScrollSpin: медленное вращение по прогрессу прокрутки ── */
export const ScrollSpin = ({
  children,
  turns = 0.12,
  className,
}: {
  children: ReactNode;
  turns?: number;
  className?: string;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const raw = useTransform(scrollYProgress, [0, 1], [0, turns * 360]);
  const rotate = useSpring(raw, { stiffness: 40, damping: 18, mass: 0.6 });
  return (
    <div ref={ref} className={className}>
      <motion.div style={{ rotate: reduce ? 0 : rotate }}>{children}</motion.div>
    </div>
  );
};

/* ── useParallax: сдвиг элемента по прокрутке (для hero) ──── */
export const useParallax = (distance = 60): { ref: React.RefObject<HTMLDivElement | null>; y: MotionValue<number> | number } => {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, distance]);
  return { ref, y: reduce ? 0 : y };
};
