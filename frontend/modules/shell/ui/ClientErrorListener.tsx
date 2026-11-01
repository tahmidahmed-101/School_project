"use client";

import { useEffect } from "react";
import { installClientErrorListeners } from "@/lib/client-error";

export function ClientErrorListener() {
  useEffect(() => installClientErrorListeners(), []);
  return null;
}
