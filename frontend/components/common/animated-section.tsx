"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Smooth entrance for sections as they scroll into view.
 *
 * We rely on framer-motion's declarative `whileInView` instead of a manual
 * `useInView` hook. With `useInView` + variant strings, motion sometimes
 * latches the first computed variant as the resting state and never runs
 * a transition — especially when `useReducedMotion()` returns `null` on the
 * first render, then `false` after hydration. `whileInView` sidesteps that
 * by being driven entirely by an IntersectionObserver inside motion.
 */
const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 18, filter: "blur(8px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.9, ease: [0.16, 0.84, 0.3, 1] },
  },
};

const staggerContainer: Variants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

const staggerItem: Variants = {
  hidden: { opacity: 0, y: 14, filter: "blur(6px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.8, ease: [0.16, 0.84, 0.3, 1] },
  },
};

const VIEWPORT = { once: true, amount: 0.2 } as const;

type SectionTag = "section" | "div" | "article" | "header" | "footer";

export const AnimatedSection = ({
  children,
  delay = 0,
  className,
  as = "section",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: SectionTag;
}) => {
  // `useReducedMotion()` can be `null` on first render. Normalise to a real
  // boolean so the JSX below stays predictable.
  const reduceMotion = useReducedMotion() ?? false;
  const Tag = motion[as] as typeof motion.div;

  if (reduceMotion) {
    return <Tag className={className}>{children}</Tag>;
  }

  return (
    <Tag
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT}
      variants={sectionVariants}
      transition={{ delay }}
    >
      {children}
    </Tag>
  );
};

export const StaggerGroup = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => {
  const reduceMotion = useReducedMotion() ?? false;

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT}
      variants={staggerContainer}
    >
      {children}
    </motion.div>
  );
};

export const StaggerItem = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <motion.div className={className} variants={staggerItem}>
    {children}
  </motion.div>
);
