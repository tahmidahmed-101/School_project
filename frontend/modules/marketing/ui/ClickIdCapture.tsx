"use client";

import { useEffect } from "react";

import { captureClickIds } from "@/lib/analytics";

export function ClickIdCapture() {
  useEffect(captureClickIds, []);
  return null;
}
