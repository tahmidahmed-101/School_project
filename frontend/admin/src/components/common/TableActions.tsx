import { Link } from "react-router-dom"
import { EyeIcon, Trash2Icon, PencilIcon } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { DeleteModal } from "./DeleteModal"

type Props = {
  viewUrl?: string
  onView?: () => void
  editUrl?: string
  onEdit?: () => void
  onDelete?: () => void
  itemName: string
}

// Compose the shared Button recipe instead of hand-rolling three near-identical
// class strings, so future Button changes propagate here automatically. Only the
// per-action accent colour is layered on top.
const actionClass = (tone: "view" | "edit" | "delete") =>
  cn(
    buttonVariants({ variant: "ghost", size: "icon" }),
    tone === "view" &&
      "text-green-600 hover:bg-green-50 dark:text-green-500 dark:hover:bg-green-500/10",
    tone === "edit" &&
      "text-blue-600 hover:bg-blue-50 dark:text-blue-500 dark:hover:bg-blue-500/10",
    tone === "delete" &&
      "text-red-500 hover:bg-red-50 dark:text-red-500 dark:hover:bg-red-500/10"
  )

export function TableActions({
  viewUrl,
  onView,
  editUrl,
  onEdit,
  onDelete,
  itemName,
}: Props) {
  return (
    <div
      className="flex items-center gap-1 sm:ml-1 md:ml-1.5"
      onClick={(e) => e.stopPropagation()}
      data-no-row-click="true"
    >
      {(viewUrl || onView) && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              {viewUrl ? (
                <Link to={viewUrl} className={actionClass("view")} aria-label={`View ${itemName}`}>
                  <EyeIcon className="size-4" />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={onView}
                  className={actionClass("view")}
                  aria-label={`View ${itemName}`}
                >
                  <EyeIcon className="size-4" />
                </button>
              )}
            </TooltipTrigger>
            <TooltipContent>View</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {(editUrl || onEdit) && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              {editUrl ? (
                <Link to={editUrl} className={actionClass("edit")} aria-label={`Edit ${itemName}`}>
                  <PencilIcon className="size-4" />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={onEdit}
                  className={actionClass("edit")}
                  aria-label={`Edit ${itemName}`}
                >
                  <PencilIcon className="size-4" />
                </button>
              )}
            </TooltipTrigger>
            <TooltipContent>Edit</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {onDelete && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <DeleteModal
                  title={`Delete ${itemName}?`}
                  description={`Are you sure you want to delete "${itemName}"? This action cannot be undone.`}
                  onConfirm={() => onDelete?.()}
                  trigger={
                    <button
                      type="button"
                      className={actionClass("delete")}
                      aria-label={`Delete ${itemName}`}
                    >
                      <Trash2Icon className="size-4" />
                    </button>
                  }
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  )
}
