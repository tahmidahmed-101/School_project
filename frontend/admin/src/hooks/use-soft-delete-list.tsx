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

/** List state for a page of soft-deletable records: status column, edit / delete actions, bulk actions. */
export function useSoftDeleteList<T extends SoftDeletable>({
  fetch,
  state,
  params,
  pageSize,
  noun,
  canUpdate,
  remove,
  setActive,
  onEdit,
  itemName,
  onDeleted,
}: {
  fetch: (params: Record<string, unknown>) => { abort?: () => void } | void
  state: ListSliceState
  params?: Record<string, unknown>
  pageSize?: number
  /** Lower-case record name for messages, e.g. "carrier". */
  noun: string
  canUpdate: boolean
  remove: (id: string) => Promise<unknown>
  setActive: (id: string, active: boolean) => Promise<unknown>
  onEdit: (record: T) => void
  /** What the delete confirmation calls a row. Defaults to its name. */
  itemName?: (record: T) => string
  /** Replaces the default follow-up to a delete: a "<name> deleted" toast, then a list reload. */
  onDeleted?: (record: T) => void
}) {
  const list = useListPage({ fetch, state, params, pageSize })

  const handleDelete = async (record: T) => {
    try {
      await remove(record.id)
      if (onDeleted) {
        onDeleted(record)
      } else {
        toast.success(`${record.name} deleted`)
        list.reload()
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, `Failed to delete ${noun}`))
    }
  }

  const statusColumn: ColumnDef<T> = {
    id: "status",
    header: "STATUS",
    cell: ({ row }) => <ActiveStatusBadge deleted={row.original.deleted_at} active={row.original.is_active} />,
  }

  /** Renders nothing for read-only users; a page may also leave the column out for them. */
  const actionsColumn: ColumnDef<T> = {
    id: "actions",
    header: "ACTIONS",
    cell: ({ row }) => {
      const record = row.original
      if (!canUpdate) return null
      return (
        <TableActions
          itemName={itemName ? itemName(record) : record.name}
          onEdit={() => onEdit(record)}
          onDelete={() => handleDelete(record)}
        />
      )
    },
  }

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

  return { list, statusColumn, actionsColumn, bulk }
}
