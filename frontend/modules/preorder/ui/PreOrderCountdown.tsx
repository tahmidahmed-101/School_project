"use client";

import { Fragment, useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { useLang } from "@/lib/i18n";

interface PreOrderCountdownProps {
  endDate: string;
  className?: string;
  compact?: boolean;
}

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
}

function calculateTimeLeft(endDateStr: string): TimeRemaining {
  const diff = Math.max(0, new Date(endDateStr).getTime() - Date.now());
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / 1000 / 60) % 60);
  const seconds = Math.floor((diff / 1000) % 60);

  return { days, hours, minutes, seconds, total: diff };
}

export function PreOrderCountdown({ endDate, className = "", compact = false }: PreOrderCountdownProps) {
  const { ui, n } = useLang();
  const [mounted, setMounted] = useState(false);
  const [timeLeft, setTimeLeft] = useState<TimeRemaining>(() => calculateTimeLeft(endDate));

  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft(endDate));
    }, 1000);

    return () => clearInterval(timer);
  }, [endDate]);

  if (!mounted) {
    return null; // Prevent hydration mismatch
  }

  if (timeLeft.total <= 0) {
    return (
      <div className={`inline-flex items-center gap-1.5 text-xs font-semibold text-fg-subtle ${className}`}>
        <Clock className="h-3.5 w-3.5 text-fg-subtle" />
        <span>{ui("preOrderCloses")}</span>
      </div>
    );
  }

  const pad = (val: number) => val.toString().padStart(2, "0");

  if (compact) {
    return (
      <div className={`flex items-center gap-1.5 text-2xs font-medium text-gold-800 ${className}`}>
        <Clock className="h-3 w-3 shrink-0 text-gold-700" />
        <span>
          {ui("preOrderEndsIn")}:{" "}
          <strong className="font-bold tabular-nums">
            {n(timeLeft.days)}d {n(pad(timeLeft.hours))}h {n(pad(timeLeft.minutes))}m
          </strong>
        </span>
      </div>
    );
  }

  // The seconds box is tinted so the ticking one stands out.
  const units = [
    { label: "countdownDays", value: timeLeft.days, accent: false },
    { label: "countdownHours", value: timeLeft.hours, accent: false },
    { label: "countdownMins", value: timeLeft.minutes, accent: false },
    { label: "countdownSecs", value: timeLeft.seconds, accent: true },
  ] as const;

  return (
    <div
      className={`rounded-xl border border-gold-200/80 bg-gradient-to-r from-gold-50/90 via-gold-100/50 to-gold-50/90 p-3 sm:p-3.5 ${className}`}
    >
      <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gold-900">
        <Clock className="h-3.5 w-3.5 text-gold-700 animate-pulse" />
        <span>{ui("preOrderEndsIn")}</span>
      </div>

      <div className="flex items-center gap-2 text-center">
        {units.map((unit, index) => (
          <Fragment key={unit.label}>
            {index > 0 && <span className="font-bold text-gold-400">:</span>}
            <div className="flex min-w-[50px] flex-1 flex-col items-center rounded-lg border border-gold-200/70 bg-white/90 px-2 py-1.5 shadow-2xs">
              <span
                className={`text-base font-extrabold tabular-nums sm:text-lg ${unit.accent ? "text-gold-800" : "text-ink-950"}`}
              >
                {n(pad(unit.value))}
              </span>
              <span className="text-2xs font-bold uppercase tracking-wider text-fg-subtle">{ui(unit.label)}</span>
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
