"use client";

import React, { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { useLang } from "../lib/i18n";

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

export function PreOrderCountdown({
  endDate,
  className = "",
  compact = false,
}: PreOrderCountdownProps) {
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
      <div className={`inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 ${className}`}>
        <Clock className="h-3.5 w-3.5 text-ink-400" />
        <span>{ui("preOrderCloses")}</span>
      </div>
    );
  }

  const pad = (val: number) => val.toString().padStart(2, "0");

  if (compact) {
    return (
      <div className={`flex items-center gap-1.5 text-[11px] font-medium text-gold-700 ${className}`}>
        <Clock className="h-3 w-3 shrink-0 text-gold-600" />
        <span>
          {ui("preOrderEndsIn")}:{" "}
          <strong className="font-bold tabular-nums">
            {n(timeLeft.days)}d {n(pad(timeLeft.hours))}h {n(pad(timeLeft.minutes))}m
          </strong>
        </span>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-gold-200/80 bg-gradient-to-r from-gold-50/90 via-gold-100/50 to-gold-50/90 p-3 sm:p-3.5 ${className}`}>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gold-900">
        <Clock className="h-3.5 w-3.5 text-gold-600 animate-pulse" />
        <span>{ui("preOrderEndsIn")}</span>
      </div>

      <div className="flex items-center gap-2 text-center">
        {/* Days */}
        <div className="flex min-w-[50px] flex-1 flex-col items-center rounded-lg border border-gold-200/70 bg-white/90 px-2 py-1.5 shadow-2xs">
          <span className="text-base font-extrabold tabular-nums text-ink-950 sm:text-lg">
            {n(pad(timeLeft.days))}
          </span>
          <span className="text-[9px] font-bold uppercase tracking-wider text-ink-500">
            Days
          </span>
        </div>

        <span className="font-bold text-gold-400">:</span>

        {/* Hours */}
        <div className="flex min-w-[50px] flex-1 flex-col items-center rounded-lg border border-gold-200/70 bg-white/90 px-2 py-1.5 shadow-2xs">
          <span className="text-base font-extrabold tabular-nums text-ink-950 sm:text-lg">
            {n(pad(timeLeft.hours))}
          </span>
          <span className="text-[9px] font-bold uppercase tracking-wider text-ink-500">
            Hours
          </span>
        </div>

        <span className="font-bold text-gold-400">:</span>

        {/* Minutes */}
        <div className="flex min-w-[50px] flex-1 flex-col items-center rounded-lg border border-gold-200/70 bg-white/90 px-2 py-1.5 shadow-2xs">
          <span className="text-base font-extrabold tabular-nums text-ink-950 sm:text-lg">
            {n(pad(timeLeft.minutes))}
          </span>
          <span className="text-[9px] font-bold uppercase tracking-wider text-ink-500">
            Mins
          </span>
        </div>

        <span className="font-bold text-gold-400">:</span>

        {/* Seconds */}
        <div className="flex min-w-[50px] flex-1 flex-col items-center rounded-lg border border-gold-200/70 bg-white/90 px-2 py-1.5 shadow-2xs">
          <span className="text-base font-extrabold tabular-nums text-gold-600 sm:text-lg">
            {n(pad(timeLeft.seconds))}
          </span>
          <span className="text-[9px] font-bold uppercase tracking-wider text-ink-500">
            Secs
          </span>
        </div>
      </div>
    </div>
  );
}
