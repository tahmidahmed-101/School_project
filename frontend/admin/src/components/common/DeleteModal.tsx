import type { ReactNode } from "react"
import { Trash2Icon } from "lucide-react"
import { ConfirmDialog } from "./ConfirmDialog"

type DeleteModalProps = {
  trigger: ReactNode
  title?: string
  description?: string
  onConfirm: () => void | Promise<unknown>
}

/** The delete preset of ConfirmDialog. */
export function DeleteModal({
  trigger,
  title = "Delete Item?",
  description = "This action cannot be undone.",
  onConfirm,
}: DeleteModalProps) {
  return (
    <ConfirmDialog
      trigger={trigger}
      title={title}
      description={description}
      confirmLabel="Delete"
      destructive
      icon={<Trash2Icon />}
      onConfirm={() => onConfirm()}
    />
  )
}
