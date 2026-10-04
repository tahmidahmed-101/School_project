import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { api, extractApiError, getApiErrorMessage } from "@/lib/api/client"
import { unwrapList } from "@/lib/api/envelope"
import { formatDate, formatDateTime } from "@/lib/format"
import type { PolicyKind, StorePolicyRevision } from "@/features/system/types"

const PAGE_SIZE = 10

/** What a revision changed, read off its before/after snapshots. */
function describeChange({ previous, current }: StorePolicyRevision): string {
  const changes: string[] = []
  if (previous.is_published !== current.is_published) changes.push(current.is_published ? "Published" : "Unpublished")
  if (JSON.stringify(previous.content) !== JSON.stringify(current.content)) changes.push("Text edited")
  if (previous.effective_date !== current.effective_date) {
    changes.push(current.effective_date ? `Effective date set to ${formatDate(current.effective_date)}` : "Effective date cleared")
  }
  const rules = (["return_window_days", "preorder_returns_allowed", "non_returnable_category_ids"] as const).some(
    (key) => JSON.stringify(previous[key]) !== JSON.stringify(current[key])
  )
  if (rules) changes.push("Return eligibility changed")
  return changes.join(" · ") || "Updated"
}

/**
 * GET /admin/settings/policies/{kind}/revisions/ — the newest changes to one policy. The
 * backend writes a revision for every accepted change; they can't be edited or removed.
 */
export function PolicyRevisions({ kind, reloadKey }: { kind: PolicyKind; reloadKey: string }) {
  const [result, setResult] = useState<{ items: StorePolicyRevision[]; count: number; error: unknown } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    api
      .get(`/admin/settings/policies/${kind}/revisions/`, {
        params: { page: 1, page_size: PAGE_SIZE },
        signal: controller.signal,
      })
      .then((res) => {
        const { items, meta } = unwrapList<StorePolicyRevision>(res.data, 1, PAGE_SIZE)
        setResult({ items, count: meta.count, error: null })
      })
      .catch((err) => {
        if (!controller.signal.aborted) setResult({ items: [], count: 0, error: extractApiError(err) })
      })
    return () => controller.abort()
  }, [kind, reloadKey])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change history</CardTitle>
        <CardDescription>
          {result && result.count > result.items.length
            ? `The latest ${result.items.length} of ${result.count} changes.`
            : "Every saved change, newest first."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!result ? (
          <p className="text-sm text-muted-foreground">Loading history...</p>
        ) : result.error ? (
          <p role="alert" className="text-sm text-destructive">
            {getApiErrorMessage(result.error, "Couldn't load the change history.")}
          </p>
        ) : result.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No changes yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {result.items.map((revision) => (
              <li key={revision.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-sm">
                <span>{describeChange(revision)}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(revision.created_at)}
                  {revision.changed_by_name && ` by ${revision.changed_by_name}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
