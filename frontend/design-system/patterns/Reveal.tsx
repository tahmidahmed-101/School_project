"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

interface RevealProps {
  children: ReactNode;
  delay?: number;
  duration?: number;
  y?: number;
  className?: string;
}

interface RevealBaseProps extends Required<Pick<RevealProps, "delay" | "duration" | "y">> {
  children: ReactNode;
  className: string;
  viewport: { margin: string; amount?: number };
}

/** Fade-and-rise once when scrolled into view; renders a plain div for reduced-motion users. */
function RevealBase({ children, delay, duration, y, className, viewport }: RevealBaseProps) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, ...viewport }}
      transition={{ duration, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Section-level reveal: slow cubic-bezier rise, triggers 50px inside the viewport. */
export function ScrollReveal({ children, delay = 0, duration = 0.95, y = 28, className = "" }: RevealProps) {
  return (
    <RevealBase
      delay={delay}
      duration={duration}
      y={y}
      className={className}
      viewport={{ margin: "0px 0px -50px 0px" }}
    >
      {children}
    </RevealBase>
  );
}

/** Grid-card reveal: subtler rise, triggers once 15% of the card is visible. */
export function CardReveal({ children, delay = 0, duration = 0.85, y = 22, className = "" }: RevealProps) {
  return (
    <RevealBase
      delay={delay}
      duration={duration}
      y={y}
      className={className}
      viewport={{ margin: "0px 0px -40px 0px", amount: 0.15 }}
    >
      {children}
    </RevealBase>
  );
}
