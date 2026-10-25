"use client";

import { useEffect } from "react";
import { captureRef } from "@/lib/referral";

/** Remembers a friend's referral code from any storefront URL carrying ?ref=CODE, until checkout asks for it. */
export function ReferralCapture() {
  useEffect(() => {
    captureRef(window.location.search);
  }, []);
  return null;
}
