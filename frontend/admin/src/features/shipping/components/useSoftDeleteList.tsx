import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"

import type { BulkActions } from "@/components/common/data-table"
import { TableActions } from "@/components/common/TableActions"
import { ActiveStatusBadge } from "@/components/common/cells"
import { useListPage, type ListSliceState } from "@/hooks/use-list-page"
import { getApiErrorMessage } from "@/lib/api/client"

interface SoftDeletable {
  id: string
  name: string
  is_active: boolean
  deleted_at: string | null
}

/**
 * List state for the carrier and zone pages: a searchable, paginated list of soft-deletable
 * records with a status column and edit / delete actions.
 */
export function useSoftDeleteList<T extends SoftDeletable>({
  fetch,
  state,
  noun,
  canUpdate,
  remove,
  setActive,
  onEdit,
}: {
  fetch: (params: Record<string, unknown>) => { abort?: () => void } | void
  state: ListSliceState
  /** Lower-case record name for messages, e.g. "carrier". */
  noun: string
  canUpdate: boolean
  remove: (id: string) => Promise<unknown>
  setActive: (id: string, active: boolean) => Promise<unknown>
  onEdit: (record: T) => void
}) {
  const list = useListPage({ fetch, state })

  const handleDelete = async (record: T) => {
    try {
      await remove(record.id)
      toast.success(`${record.name} deleted`)
      list.reload()
    } catch (err) {
      toast.error(getApiErrorMessage(err, `Failed to delete ${noun}`))
    }
  }


  /** STATUS and (for editors) ACTIONS, appended after the page's own columns. */
  const trailingColumns: ColumnDef<T>[] = [
    {
      id: "status",
      header: "STATUS",
      cell: ({ row }) => <ActiveStatusBadge deleted={row.original.deleted_at} active={row.original.is_active} />,
    },
    ...(canUpdate
      ? [
          {
            id: "actions",
            header: "ACTIONS",
            cell: ({ row }) => (
              <TableActions
                itemName={row.original.name}
                onEdit={() => onEdit(row.original)}
                onDelete={() => handleDelete(row.original)}
              />
            ),
          } satisfies ColumnDef<T>,
        ]
      : []),
  ]

  /** <DataTable bulk>: tick-box bulk delete, for editors only. */
  const bulk: BulkActions<T> | undefined = canUpdate
    ? {
        noun,
        deleteRow: (record) => remove(record.id),
        activate: (rows) => Promise.all(rows.map((r) => setActive(r.id, true))),
        deactivate: (rows) => Promise.all(rows.map((r) => setActive(r.id, false))),
        onDone: list.reload,
      }
    : undefined

  return { list, trailingColumns, bulk }
}
