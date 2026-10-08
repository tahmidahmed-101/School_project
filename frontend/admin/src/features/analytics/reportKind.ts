import { useCallback } from "react"
import { useSearchParams } from "react-router-dom"
import type { Kind } from "@/hooks/use-kind"

/** Which half a report page shows, kept in the URL (?kind=preorder); stock when absent. */
export function useReportKind(): [Kind, (kind: Kind) => void] {
  const [params, setParams] = useSearchParams()
  const kind: Kind = params.get("kind") === "preorder" ? "preorder" : "stock"

  const setKind = useCallback(
    (next: Kind) => {
      setParams(
        (prev) => {
          const out = new URLSearchParams(prev)
          if (next === "stock") out.delete("kind")
          else out.set("kind", next)
          return out
        },
        { replace: true }
      )
    },
    [setParams]
  )

  return [kind, setKind]
}
