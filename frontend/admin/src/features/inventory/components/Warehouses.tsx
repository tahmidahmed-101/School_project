import { useEffect, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { PlusIcon, Star, Warehouse as WarehouseIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { FormDialog, SwitchField } from "@/components/common/FormDialog"
import { PageHeader } from "@/components/common/PageHeader"
import { TableActions } from "@/components/common/TableActions"
import { ActiveStatusBadge, DateCell, TextCell } from "@/components/common/cells"
import { TextField, TextareaField } from "@/components/common/form-fields"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useCan } from "@/hooks/use-can"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useListPage } from "@/hooks/use-list-page"
import { getApiErrorMessage } from "@/lib/api/client"
import { reportFormError } from "@/lib/forms"

import { deleteData, fetchAll } from "../slices/warehouseSlice"
import { createWarehouse, updateWarehouse } from "../api"
import type { Warehouse, WarehousePayload } from "../types"

const PAGE_SIZE = 20

const Warehouses = () => {
  useDocumentTitle("Warehouses")
  const dispatch = useAppDispatch()
  const canManage = useCan("inventory.manage")
  const warehouseState = useAppSelector((s) => s.inventoryWarehouses)
  const list = useListPage({
    fetch: (p) => dispatch(fetchAll(p)),
    state: warehouseState,
    pageSize: PAGE_SIZE,
  })

  const [editing, setEditing] = useState<Warehouse | null>(null)
  const [formOpen, setFormOpen] = useState(false)


  const columns: ColumnDef<Warehouse>[] = [
    {
      accessorKey: "name",
      header: "WAREHOUSE",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{row.original.name}</span>
          {row.original.is_default && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              <Star className="size-3 fill-current" /> Default
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "code",
      header: "CODE",
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.code}</span>,
    },
    {
      accessorKey: "address",
      header: "ADDRESS",
      cell: ({ row }) => <TextCell value={row.original.address} muted className="line-clamp-2" />,
    },
    {
      id: "status",
      header: "STATUS",
      cell: ({ row }) => <ActiveStatusBadge active={row.original.is_active} />,
    },
    {
      accessorKey: "created_at",
      header: "CREATED",
      cell: ({ row }) => <DateCell value={row.original.created_at} className="text-muted-foreground" />,
    },
    ...(canManage
      ? [
          {
            id: "actions",
            header: "ACTIONS",
            cell: ({ row }: { row: { original: Warehouse } }) => {
              const w = row.original
              return (
                <TableActions
                  itemName={w.name}
                  onEdit={() => {
                    setEditing(w)
                    setFormOpen(true)
                  }}
                  onDelete={
                    w.is_default
                      ? undefined
                      : async () => {
                          try {
                            await dispatch(deleteData(w.id)).unwrap()
                            toast.success(`${w.name} deleted`)
                          } catch (err) {
                            toast.error(getApiErrorMessage(err, "Failed to delete warehouse"))
                          }
                        }
                  }
                />
              )
            },
          } as ColumnDef<Warehouse>,
        ]
      : []),
  ]

  return (
    <div className="section-container">
      <PageHeader
        title="Warehouses"
        actions={
          canManage && (
            <Button
              size="action"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <PlusIcon className="size-5" /> Add Warehouse
            </Button>
          )
        }
      />

      <FilterToolbar searchPlaceholder="Search name or code…" searchValue={list.search} onSearchChange={list.setSearch} />

      <DataTable
        columns={columns}
        bulk={
          canManage
            ? {
        noun: "warehouse",
        deleteRow: (w) => dispatch(deleteData(w.id)).unwrap(),
        activate: (rows) => Promise.all(rows.map((w) => updateWarehouse(w.id, { is_active: true }))),
        deactivate: (rows) => Promise.all(rows.map((w) => updateWarehouse(w.id, { is_active: false }))),
        onDone: list.reload,
      }
            : undefined
        }
        data={warehouseState.data}
        {...list.tableProps}
        emptyIcon={WarehouseIcon}
        emptyTitle="No warehouses"
        minWidth="860px"
        columnWidths={["240px", "110px", "260px", "110px", "120px", ...(canManage ? ["80px"] : [])]}
        unlabelledColumns={["actions"]}
      />

      {canManage && (
        <WarehouseFormDialog open={formOpen} onOpenChange={setFormOpen} warehouse={editing} onSaved={list.reload} />
      )}
    </div>
  )
}

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  code: z.string().trim().min(1, "Code is required"),
  address: z.string(),
  is_active: z.boolean(),
  is_default: z.boolean(),
})
type FormValues = z.infer<typeof schema>

function WarehouseFormDialog({
  open,
  onOpenChange,
  warehouse,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  warehouse: Warehouse | null
  onSaved: () => void
}) {
  const {
    control,
    register,
    reset,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", code: "", address: "", is_active: true, is_default: false },
  })

  useEffect(() => {
    if (open) {
      reset({
        name: warehouse?.name ?? "",
        code: warehouse?.code ?? "",
        address: warehouse?.address ?? "",
        is_active: warehouse?.is_active ?? true,
        is_default: warehouse?.is_default ?? false,
      })
    }
  }, [open, warehouse, reset])

  const onSubmit = async (values: FormValues) => {
    const payload: WarehousePayload = { ...values }
    try {
      if (warehouse) {
        await updateWarehouse(warehouse.id, payload)
        toast.success(`${values.name} updated`)
      } else {
        await createWarehouse(payload)
        toast.success(`${values.name} created`)
      }
      onSaved()
      onOpenChange(false)
    } catch (err) {
      reportFormError(err, { setError, fields: Object.keys(values), fallback: "Failed to save warehouse" })
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={warehouse ? `Edit ${warehouse.name}` : "Add warehouse"}
      description="Warehouses with stock can't be deleted — move or zero their stock first."
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting}
      submitLabel={warehouse ? "Save" : "Create"}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Name" id="wh-name" placeholder="Main Warehouse" error={errors.name} {...register("name")} />
        <TextField label="Code" id="wh-code" placeholder="MAIN" error={errors.code} {...register("code")} />
        <TextareaField
          className="sm:col-span-2"
          label="Address"
          id="wh-address"
          rows={2}
          error={errors.address}
          {...register("address")}
        />
        <SwitchField control={control} name="is_active" label="Active" />
        <SwitchField
          control={control}
          name="is_default"
          label="Default"
          description="Replaces the current default."
          disabled={warehouse?.is_default}
        />
      </div>
    </FormDialog>
  )
}

export default Warehouses
