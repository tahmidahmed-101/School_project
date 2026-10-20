import { useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { ImageIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { TableActions } from "@/components/common/TableActions"
import FilterToolbar from "@/components/common/FilterToolBar"
import { Combobox } from "@/components/common/ComboBox"
import { DataTable } from "@/components/common/data-table"
import { StatusBadge } from "@/components/common/StatusBadge"
import { PageHeader } from "@/components/common/PageHeader"
import { ProductCell, Thumbnail } from "@/components/common/cells"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import {
  deletePromotionPopup,
  fetchPromotionPopups,
  savePromotionPopup,
} from "@/features/system/slices/businessSettingsSlice"
import type { PromotionPopup } from "@/features/system/types"
import { useCan } from "@/hooks/use-can"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useKind } from "@/hooks/use-kind"
import { getApiErrorMessage } from "@/lib/api/client"
import type { Option } from "@/lib/types"
import { POPUP_STATUS_TONES, SHOP_COPY, destinationLabel, scheduleLabel } from "../lib/promotionPopups"
import { PromotionPopupFormDialog } from "./PromotionPopupFormDialog"

const STATUS_OPTIONS: Option[] = [
  { value: "active", label: "Active" },
  { value: "scheduled", label: "Scheduled" },
  { value: "expired", label: "Expired" },
  { value: "inactive", label: "Inactive" },
]

/** Marketing → Promotion popups, on both halves: the popups of the shop the dashboard is in. */
const PromotionPopups = () => {
  useDocumentTitle("Promotion popups")

  const dispatch = useAppDispatch()
  const shop = useKind()
  // The popups live in the shop settings on the backend: settings.view reads them, settings.manage edits them.
  const canManage = useCan("settings.manage")
  const { data: allPopups, status: loadStatus, error } = useAppSelector((state) => state.businessSettings.promotionPopups)

  const [status, setStatus] = useState<Option | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  // The add / edit form opens in a dialog over the list; `editing` null adds a popup.
  const [editing, setEditing] = useState<PromotionPopup | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const openForm = (popup: PromotionPopup | null) => {
    setEditing(popup)
    setFormOpen(true)
  }

  const popups = useMemo(
    () =>
      allPopups.filter((popup) => popup.shop === shop && (!status || popup.display_status === status.value)),
    [allPopups, shop, status]
  )

  useEffect(() => {
    const request = dispatch(fetchPromotionPopups())
    return () => request.abort()
  }, [dispatch])

  const toggle = async (popup: PromotionPopup, is_active: boolean) => {
    setSaving(popup.id)
    try {
      await dispatch(savePromotionPopup({ id: popup.id, values: { is_active } })).unwrap()
      toast.success(`Popup switched ${is_active ? "on" : "off"}`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't update the popup"))
    } finally {
      setSaving(null)
    }
  }

  const handleDelete = async (popup: PromotionPopup) => {
    try {
      await dispatch(deletePromotionPopup(popup.id)).unwrap()
      toast.success(`Popup ${popup.name} deleted`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't delete this popup"))
    }
  }

  const columns: ColumnDef<PromotionPopup>[] = [
    {
      accessorKey: "name",
      header: "POPUP",
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-3">
          <Thumbnail src={row.original.image ?? undefined} icon={ImageIcon} className="w-14" />
          <ProductCell name={row.original.name} sub={destinationLabel(row.original)} />
        </div>
      ),
    },
    {
      id: "active",
      header: "ON",
      cell: ({ row }) => (
        // The switch must not open the row.
        <div onClick={(event) => event.stopPropagation()}>
          <Switch
            aria-label={`Switch ${row.original.name} on`}
            checked={row.original.is_active}
            disabled={!canManage || saving === row.original.id}
            onCheckedChange={(checked) => toggle(row.original, checked)}
          />
        </div>
      ),
    },
    {
      accessorKey: "priority",
      header: "PRIORITY",
      cell: ({ row }) => <span className="text-sm tabular-nums">{row.original.priority}</span>,
    },
    {
      id: "schedule",
      header: "SCHEDULE",
      cell: ({ row }) => (
        <span className="text-sm whitespace-nowrap text-muted-foreground">{scheduleLabel(row.original)}</span>
      ),
    },
    {
      id: "status",
      header: "STATUS",
      cell: ({ row }) => (
        <StatusBadge status={row.original.display_status} tone={POPUP_STATUS_TONES[row.original.display_status]} />
      ),
    },
    {
      id: "actions",
      header: "ACTIONS",
      cell: ({ row }) => (
        <TableActions
          itemName={row.original.name}
          {...(canManage
            ? { onEdit: () => openForm(row.original), onDelete: () => handleDelete(row.original) }
            : { onView: () => openForm(row.original) })}
        />
      ),
    },
  ]

  return (
    <div className="section-container">
      <PageHeader
        title="Promotion popups"
        actions={
          canManage && (
            <Button variant="apply" size="action" onClick={() => openForm(null)}>
              <PlusIcon className="size-5" /> Add Popup
            </Button>
          )
        }
      />

      <FilterToolbar
        filters={[
          {
            active: Boolean(status),
            component: (
              <Combobox placeholder="Status" options={STATUS_OPTIONS} value={status} onValueChange={setStatus} />
            ),
          },
        ]}
      />

      <DataTable
        columns={columns}
        bulk={
          canManage
            ? {
                noun: "popup",
                deleteRow: (popup) => dispatch(deletePromotionPopup(popup.id)).unwrap(),
                onDone: () => dispatch(fetchPromotionPopups()),
              }
            : undefined
        }
        data={popups}
        showPagination={false}
        isLoading={loadStatus === "loading" && !popups.length}
        error={loadStatus === "failed" && !popups.length ? error : null}
        onRetry={() => dispatch(fetchPromotionPopups())}
        onRowClick={(popup) => openForm(popup)}
        emptyTitle="No promotion popups yet"
        emptyDescription={`Add an image popup for ${SHOP_COPY[shop].pages}.`}
        {...(canManage ? { emptyActionLabel: "Add Popup", onEmptyAction: () => openForm(null) } : {})}
        minWidth="960px"
        columnWidths={["280px", "70px", "90px", "250px", "110px", "80px"]}
      />

      <PromotionPopupFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        popup={editing}
        shop={shop}
        readOnly={!canManage}
      />
    </div>
  )
}

export default PromotionPopups
