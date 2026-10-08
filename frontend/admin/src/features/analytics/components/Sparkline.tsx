import { lazy, Suspense } from "react"
import { cn } from "@/lib/utils"

const SparklineChart = lazy(() => import("./SparklineChart"))

/** Decorative trend line; the number it summarises is always shown as text next to it. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null
  return (
    <Suspense fallback={<div className={cn("h-10 w-full", className)} aria-hidden />}>
      <SparklineChart values={values} className={className} />
    </Suspense>
  )
}
