"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

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

/** Fade-and-rise once when scrolled into view. CSS transitions instead of framer-motion: dozens of these per page
 * made the animation runtime the largest main-thread cost on mobile. */
function RevealBase({ children, delay, duration, y, className, viewport }: RevealBaseProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const { margin, amount = 0 } = viewport;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const { top, bottom } = el.getBoundingClientRect();
    const onScreen = top < window.innerHeight && bottom > 0;
    // Content in the first screen is never hidden: waiting for hydration to fade it in delays the largest paint.
    if (onScreen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.setAttribute("data-shown", "");
      setShown(true);
      root.classList.add("reveal-ready");
      return;
    }
    root.classList.add("reveal-ready");
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

  // Hidden-state styles live in globals.css under html.reveal-ready, so content stays visible until hydration and without JS.
  return (
    <div
      ref={ref}
      className={className}
      data-reveal=""
      data-shown={shown ? "" : undefined}
      style={
        {
          "--reveal-y": `${y}px`,
          "--reveal-duration": `${duration}s`,
          "--reveal-delay": `${delay}s`,
        } as CSSProperties
      }
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
