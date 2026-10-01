import { useCallback, useEffect, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2, PlusIcon, Star, Warehouse as WarehouseIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { PageHeading } from "@/components/common/PageHeading"
import { StatusBadge } from "@/components/common/StatusBadge"
import { TableActions } from "@/components/common/TableActions"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/client"
import { formatDate } from "@/lib/format"
import { usePermission } from "@/features/catalog/lib/usePermission"
import { useDebounced } from "@/features/catalog/lib/useDebounced"
import { CsvImportButton, type ImportField } from "@/components/common/CsvImportDialog"

import { deleteData, fetchAll } from "../slices/warehouseSlice"
import { createWarehouse, updateWarehouse } from "../api"
import type { Warehouse, WarehousePayload } from "../types"

const PAGE_SIZE = 20

const importFields: ImportField[] = [
  { key: "name", label: "Name", required: true, aliases: ["warehouse", "warehouse name"], example: "Chattogram Hub" },
  { key: "code", label: "Code", required: true, aliases: ["warehouse code"], example: "CTG-01" },
  { key: "address", label: "Address", example: "Agrabad C/A, Chattogram 4100" },
  { key: "is_active", label: "Active", type: "boolean", aliases: ["is active", "status"], example: "yes" },
  { key: "is_default", label: "Default", type: "boolean", aliases: ["is default", "default warehouse"], example: "no" },
]

const Warehouses = () => {
  useDocumentTitle("Warehouses")
  const dispatch = useAppDispatch()
  const canManage = usePermission("inventory.manage")
  const { data: warehouses, isFetchingList, error, totalItems } = useAppSelector((s) => s.inventoryWarehouses)

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounced(search)
  const [editing, setEditing] = useState<Warehouse | null>(null)
  const [formOpen, setFormOpen] = useState(false)

  const params = useMemo(
    () => ({ page, page_size: PAGE_SIZE, ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}) }),
    [page, debouncedSearch]
  )
  const load = useCallback(() => {
    dispatch(fetchAll(params))
  }, [dispatch, params])
  useEffect(() => {
    load()
  }, [load])

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
      cell: ({ row }) => <span className="line-clamp-2 text-sm text-muted-foreground">{row.original.address || "—"}</span>,
    },
    {
      id: "status",
      header: "STATUS",
      cell: ({ row }) => <StatusBadge status={row.original.is_active ? "active" : "inactive"} />,
    },
    {
      accessorKey: "created_at",
      header: "CREATED",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatDate(row.original.created_at)}</span>,
    },
    ...(canManage
      ? [
          {
            id: "actions",
            header: "ACTION",
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
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeading title="Warehouses" description="Locations that hold stock. The default warehouse receives unassigned movements." />
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <CsvImportButton
              entityName="warehouses"
              fields={importFields}
              createRow={(payload) => createWarehouse(payload as WarehousePayload)}
              onComplete={load}
            />
            <Button
              size="action"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <PlusIcon className="size-5" /> Add Warehouse
            </Button>
          </div>
        )}
      </div>

      <FilterToolbar
        searchPlaceholder="Search name or code…"
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v)
          setPage(1)
        }}
      />

      <DataTable
        columns={columns}
        data={warehouses}
        isLoading={isFetchingList}
        error={error}
        onRetry={load}
        manualPagination
        pageSize={PAGE_SIZE}
        pageIndex={page - 1}
        pageCount={Math.max(1, Math.ceil(totalItems / PAGE_SIZE))}
        totalCount={totalItems}
        onPageChange={(i) => setPage(i + 1)}
        emptyIcon={WarehouseIcon}
        emptyTitle="No warehouses"
        minWidth="860px"
        columnWidths={["240px", "110px", "260px", "110px", "120px", ...(canManage ? ["110px"] : [])]}
        unlabelledColumns={["actions"]}
      />

      {canManage && (
        <WarehouseFormDialog open={formOpen} onOpenChange={setFormOpen} warehouse={editing} onSaved={load} />
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
      for (const [field, message] of Object.entries(getApiFieldErrors(err))) {
        if (field in values) setError(field as keyof FormValues, { message })
      }
      toast.error(getApiErrorMessage(err, "Failed to save warehouse"))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{warehouse ? `Edit ${warehouse.name}` : "Add warehouse"}</DialogTitle>
          <DialogDescription>Warehouses with stock can't be deleted — move or zero their stock first.</DialogDescription>
        </DialogHeader>
        <form id="warehouse-form" onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="wh-name">Name</FieldLabel>
            <FieldContent>
              <Input id="wh-name" placeholder="Main Warehouse" {...register("name")} />
              <FieldError errors={[errors.name]} />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor="wh-code">Code</FieldLabel>
            <FieldContent>
              <Input id="wh-code" placeholder="MAIN" {...register("code")} />
              <FieldError errors={[errors.code]} />
            </FieldContent>
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="wh-address">Address</FieldLabel>
            <FieldContent>
              <Textarea id="wh-address" rows={2} {...register("address")} />
              <FieldError errors={[errors.address]} />
            </FieldContent>
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="wh-active">Active</FieldLabel>
            </FieldContent>
            <Controller
              control={control}
              name="is_active"
              render={({ field }) => <Switch id="wh-active" checked={field.value} onCheckedChange={field.onChange} />}
            />
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="wh-default">Default</FieldLabel>
              <FieldDescription>Replaces the current default.</FieldDescription>
            </FieldContent>
            <Controller
              control={control}
              name="is_default"
              render={({ field }) => (
                <Switch
                  id="wh-default"
                  checked={field.value}
                  disabled={warehouse?.is_default}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="warehouse-form" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            {warehouse ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default Warehouses
