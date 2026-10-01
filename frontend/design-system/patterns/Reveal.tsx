"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

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

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Fade-and-rise once when scrolled into view. CSS transitions instead of framer-motion: dozens of these per page
 * made the animation runtime the largest main-thread cost on mobile. */
function RevealBase({ children, delay, duration, y, className, viewport }: RevealBaseProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const { margin, amount = 0 } = viewport;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: margin, threshold: amount },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [margin, amount]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : `translateY(${y}px)`,
        transition: `opacity ${duration}s ${EASE} ${delay}s, transform ${duration}s ${EASE} ${delay}s`,
      }}
    >
      {children}
    </div>
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
