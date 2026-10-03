import { useState } from "react"
import { Link } from "react-router-dom"
import { EyeIcon, MoreVertical, PencilIcon, RotateCcw, Trash2Icon, type LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ConfirmDialog } from "./ConfirmDialog"

/** An extra row action listed in the menu between Edit and Delete. */
export interface TableAction {
  label: string
  icon?: LucideIcon
  /** Navigate on select… */
  to?: string
  /** …or run a handler. */
  onSelect?: () => void
  destructive?: boolean
  disabled?: boolean
}

type Props = {
  viewUrl?: string
  onView?: () => void
  editUrl?: string
  onEdit?: () => void
  onDelete?: () => void | Promise<unknown>
  /** Soft-deleted rows offer only Restore (when `onRestore` is given). */
  deleted?: boolean
  onRestore?: () => void | Promise<unknown>
  /** Disables Restore, e.g. while a mutation is in flight. */
  restoreDisabled?: boolean
  /** Row-specific actions beyond view / edit / delete. */
  actions?: TableAction[]
  itemName: string
}

/** Restore button for a soft-deleted row; clicks don't trigger the row's own link. */
export function RestoreButton({
  onClick,
  label,
  disabled = false,
}: {
  onClick: () => void | Promise<unknown>
  label: string
  disabled?: boolean
}) {
  return (
    <div onClick={(e) => e.stopPropagation()} data-no-row-click="true">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => void onClick()}
        aria-label={`Restore ${label}`}
      >
        <RotateCcw className="size-3.5" /> Restore
      </Button>
    </div>
  )
}

/** The row's action menu: a three-dot button that opens the actions by name. */
export function TableActions({
  viewUrl,
  onView,
  editUrl,
  onEdit,
  onDelete,
  deleted = false,
  onRestore,
  restoreDisabled = false,
  actions = [],
  itemName,
}: Props) {
  // The confirm dialog lives outside the menu: a dialog opened from inside a menu item
  // would be unmounted as soon as the menu closes.
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const items: TableAction[] = deleted
    ? onRestore
      ? [{ label: "Restore", icon: RotateCcw, onSelect: () => void onRestore(), disabled: restoreDisabled }]
      : []
    : [
        ...(viewUrl || onView ? [{ label: "View", icon: EyeIcon, to: viewUrl, onSelect: onView }] : []),
        ...(editUrl || onEdit ? [{ label: "Edit", icon: PencilIcon, to: editUrl, onSelect: onEdit }] : []),
        ...actions,
      ]
  const canDelete = !deleted && Boolean(onDelete)

  if (items.length === 0 && !canDelete) return null

  return (
    <div className="flex justify-center" onClick={(e) => e.stopPropagation()} data-no-row-click="true">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label={`Actions for ${itemName}`}>
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-36 duration-200">
          {items.map((item) => {
            const Icon = item.icon
            const content = (
              <>
                {Icon && <Icon className="size-4" />}
                {item.label}
              </>
            )
            return item.to ? (
              <DropdownMenuItem key={item.label} asChild disabled={item.disabled}>
                <Link to={item.to}>{content}</Link>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                key={item.label}
                variant={item.destructive ? "destructive" : "default"}
                disabled={item.disabled}
                onSelect={item.onSelect}
              >
                {content}
              </DropdownMenuItem>
            )
          })}
          {canDelete && (
            <>
              {items.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmingDelete(true)}>
                <Trash2Icon className="size-4" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {canDelete && (
        <ConfirmDialog
          open={confirmingDelete}
          onOpenChange={setConfirmingDelete}
          title={`Delete ${itemName}?`}
          description={`Are you sure you want to delete "${itemName}"? This action cannot be undone.`}
          confirmLabel="Delete"
          destructive
          icon={<Trash2Icon />}
          onConfirm={() => onDelete?.()}
        />
      )}
    </div>
  )
}
