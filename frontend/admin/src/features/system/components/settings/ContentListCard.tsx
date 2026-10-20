import { useState, type ReactNode } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { Plus, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { DataTable } from "@/components/common/data-table"
import { TableActions } from "@/components/common/TableActions"
import { TextCell } from "@/components/common/cells"
import { getApiErrorMessage } from "@/lib/api/client"

/** What every storefront content row has: hero slides and promo lines alike. */
interface ContentItem {
  id: string
  sort_order: number
  is_active: boolean
}

/** The add / edit form a card opens; each kind of content brings its own. */
export interface ContentFormProps<T> {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The row being edited, or null to add a new one. */
  editing: T | null
  /** One past the highest order on this shop, so a new row lands at the end. */
  nextSortOrder: number
}

/**
 * The frame shared by the storefront content cards (hero slides, promo lines): title, an Add
 * button, the list with its order, a show/hide switch, edit and delete. The content column,
 * the form and the data are the caller's, so each kind of content and each shop (stock or
 * pre-order) keeps its own.
 */
export function ContentListCard<T extends ContentItem>({
  title,
  description,
  addLabel,
  canManage,
  items,
  status,
  error,
  onRetry,
  contentColumn,
  itemName,
  switchLabel,
  onToggle,
  toggledMessage,
  toggleError,
  onDelete,
  deletedMessage,
  deleteError,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  renderForm,
}: {
  title: string
  description: string
  addLabel: string
  canManage: boolean
  /** Already narrowed to this card's shop. */
  items: T[]
  status: string
  error: unknown
  onRetry: () => void
  /** The first column: what the row shows (an image and title, or the text). */
  contentColumn: ColumnDef<T>
  itemName: (item: T) => string
  /** Screen-reader label of the row's show/hide switch. */
  switchLabel: (item: T) => string
  onToggle: (item: T, isActive: boolean) => Promise<unknown>
  toggledMessage: (item: T, isActive: boolean) => string
  toggleError: string
  onDelete: (item: T) => Promise<unknown>
  deletedMessage: (item: T) => string
  deleteError: string
  emptyIcon: LucideIcon
  emptyTitle: string
  emptyDescription?: string
  renderForm: (form: ContentFormProps<T>) => ReactNode
}) {
  const [saving, setSaving] = useState<string | null>(null)
  const [editing, setEditing] = useState<T | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const toggle = async (item: T, isActive: boolean) => {
    setSaving(item.id)
    try {
      await onToggle(item, isActive)
      toast.success(toggledMessage(item, isActive))
    } catch (err) {
      toast.error(getApiErrorMessage(err, toggleError))
    } finally {
      setSaving(null)
    }
  }

  const handleDelete = async (item: T) => {
    try {
      await onDelete(item)
      toast.success(deletedMessage(item))
    } catch (err) {
      toast.error(getApiErrorMessage(err, deleteError))
    }
  }

  const openForm = (item: T | null) => {
    setEditing(item)
    setFormOpen(true)
  }

  const columns: ColumnDef<T>[] = [
    contentColumn,
    {
      accessorKey: "sort_order",
      header: "ORDER",
      cell: ({ row }) => <TextCell value={row.original.sort_order} />,
    },
    {
      id: "active",
      header: "ACTIVE",
      cell: ({ row }) => (
        <Switch
          aria-label={switchLabel(row.original)}
          checked={row.original.is_active}
          disabled={!canManage || saving === row.original.id}
          onCheckedChange={(checked) => toggle(row.original, checked)}
        />
      ),
    },
    ...(canManage
      ? [
          {
            id: "actions",
            header: "ACTIONS",
            cell: ({ row }) => (
              <TableActions
                itemName={itemName(row.original)}
                onEdit={() => openForm(row.original)}
                onDelete={() => handleDelete(row.original)}
              />
            ),
          } satisfies ColumnDef<T>,
        ]
      : []),
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {canManage && (
          <CardAction>
            <Button variant="outline" size="sm" onClick={() => openForm(null)}>
              <Plus className="h-4 w-4" />
              {addLabel}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <DataTable
          embedded
          showPagination={false}
          columns={columns}
          data={items}
          isLoading={status === "loading" && !items.length}
          error={status === "failed" && !items.length ? error : null}
          onRetry={onRetry}
          emptyIcon={emptyIcon}
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
          minWidth="520px"
          columnWidths={["auto", "90px", "90px", ...(canManage ? ["80px"] : [])]}
          unlabelledColumns={["actions"]}
        />
      </CardContent>

      {canManage &&
        renderForm({
          open: formOpen,
          onOpenChange: setFormOpen,
          editing,
          nextSortOrder: items.length ? Math.max(...items.map((item) => item.sort_order)) + 1 : 0,
        })}
    </Card>
  )
}
