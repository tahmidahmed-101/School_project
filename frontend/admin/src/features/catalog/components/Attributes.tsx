import { useId, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { Plus, PlusIcon, SlidersHorizontal, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { PageHeader } from "@/components/common/PageHeader"
import { TableActions } from "@/components/common/TableActions"
import { SaveSwitch } from "@/components/common/SaveSwitch"
import { StatusBadge } from "@/components/common/StatusBadge"
import { FormDialog } from "@/components/common/FormDialog"
import { FormField } from "@/components/common/form-fields"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useCan } from "@/hooks/use-can"
import { useListPage } from "@/hooks/use-list-page"
import { getApiErrorMessage } from "@/lib/api/client"

import { deleteData, fetchAll } from "../slices/shopOptionSlice"
import { createShopOption, updateShopOption } from "../api"
import { cleanOptionText, valueRefusal } from "../lib/options"
import type { ShopOption } from "../types"

/** The shop's own options (Size, Colour, ...), which the product form offers when a product gets options. */
const Attributes = () => {
  useDocumentTitle("Attributes")
  const dispatch = useAppDispatch()
  const canManage = useCan("catalog.manage")
  const optionState = useAppSelector((s) => s.shopOptions)

  const [editing, setEditing] = useState<ShopOption | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  // Bumped on every open, so the dialog starts from the attribute it is given.
  const [formKey, setFormKey] = useState(0)
  const openForm = (option: ShopOption | null) => {
    setEditing(option)
    setFormKey((key) => key + 1)
    setFormOpen(true)
  }

  const list = useListPage({
    fetch: (p) => dispatch(fetchAll(p)),
    state: optionState,
    params: {},
  })

  const handleDelete = async (option: ShopOption) => {
    try {
      await dispatch(deleteData(option.id)).unwrap()
      toast.success(`${option.name} deleted`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to delete attribute"))
    }
  }

  const columns: ColumnDef<ShopOption>[] = [
    {
      accessorKey: "name",
      header: "ATTRIBUTE",
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      id: "values",
      header: "VALUES",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1.5">
          {row.original.values.map((value) => (
            <Badge key={value} variant="secondary">
              {value}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      id: "active",
      header: "ACTIVE",
      cell: ({ row }) =>
        canManage ? (
          <SaveSwitch
            // Remounted when the list brings a new value.
            key={`${row.original.id}-${row.original.is_active}`}
            label={`${row.original.name} is active`}
            checked={row.original.is_active}
            save={(next) => updateShopOption(row.original.id, { is_active: next })}
            failure={`Failed to update ${row.original.name}`}
          />
        ) : (
          <StatusBadge status={row.original.is_active ? "active" : "inactive"} />
        ),
    },
    {
      id: "actions",
      header: "ACTIONS",
      cell: ({ row }) => {
        const option = row.original
        if (!canManage) return null
        return (
          <TableActions itemName={option.name} onEdit={() => openForm(option)} onDelete={() => handleDelete(option)} />
        )
      },
    },
  ]

  return (
    <div className="section-container">
      <PageHeader
        title="Attributes"
        actions={
          canManage && (
            <Button size="action" onClick={() => openForm(null)}>
              <PlusIcon className="size-5" /> Add Attribute
            </Button>
          )
        }
      />

      <FilterToolbar
        searchPlaceholder="Search attributes…"
        searchValue={list.search}
        onSearchChange={list.setSearch}
        filters={[]}
      />

      <DataTable
        columns={columns}
        data={optionState.data}
        {...list.tableProps}
        emptyIcon={SlidersHorizontal}
        emptyTitle="No attributes"
        emptyDescription="Add an attribute like Size or Colour, then pick it as an option on a product."
        minWidth="640px"
        columnWidths={["220px", "auto", "100px", "80px"]}
        unlabelledColumns={["actions"]}
      />

      {canManage && (
        <AttributeFormDialog
          key={formKey}
          open={formOpen}
          onOpenChange={setFormOpen}
          option={editing}
          onSaved={list.reload}
        />
      )}
    </div>
  )
}

function AttributeFormDialog({
  open,
  onOpenChange,
  option,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  option: ShopOption | null
  onSaved: () => void
}) {
  const id = useId()
  const [name, setName] = useState(option?.name ?? "")
  const [values, setValues] = useState<string[]>(option?.values ?? [])
  const [typed, setTyped] = useState("")
  const [nameError, setNameError] = useState("")
  const [valueError, setValueError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  /** The list with what is typed added, or null when the typed value is refused. */
  const withTyped = (list: string[]): string[] | null => {
    const refusal = valueRefusal(list, typed)
    setValueError(refusal ?? "")
    return refusal ? null : [...list, cleanOptionText(typed)]
  }

  const add = () => {
    const next = withTyped(values)
    if (!next) return
    setValues(next)
    setTyped("")
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // A value still sitting in the input counts, so nobody loses it by pressing Save first.
    const finalValues = cleanOptionText(typed) ? withTyped(values) : values
    if (!finalValues) return
    const cleanName = cleanOptionText(name)
    setNameError(cleanName ? "" : "Name is required")
    if (finalValues.length === 0) setValueError("Add at least one value.")
    if (!cleanName || finalValues.length === 0) return

    const payload = { name: cleanName, values: finalValues }
    setSubmitting(true)
    try {
      if (option) await updateShopOption(option.id, payload)
      else await createShopOption(payload)
      toast.success(`${cleanName} ${option ? "updated" : "created"}`)
      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to save attribute"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={option ? `Edit ${option.name}` : "Add attribute"}
      description="Offered as an option on the product form. Products that already use it keep their own values."
      onSubmit={onSubmit}
      submitting={submitting}
      submitLabel={option ? "Save attribute" : "Create attribute"}
    >
      <FormField label="Name" htmlFor={`${id}-name`} error={nameError ? { message: nameError } : undefined}>
        <Input
          id={`${id}-name`}
          autoComplete="off"
          placeholder="e.g. Size"
          maxLength={50}
          value={name}
          aria-invalid={nameError ? true : undefined}
          onChange={(e) => {
            setName(e.target.value)
            setNameError("")
          }}
          onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
        />
      </FormField>

      <FormField label="Values" htmlFor={`${id}-value`} error={valueError ? { message: valueError } : undefined}>
        <div className="flex gap-2">
          <div className="flex min-h-11 min-w-0 flex-1 flex-wrap items-center gap-1.5 rounded-lg border border-field-border bg-field-bg px-2 py-1.5 transition-all focus-within:border-transparent focus-within:ring-2 focus-within:ring-primary">
            {values.map((value) => (
              <Badge key={value} variant="secondary" className="max-w-full gap-1 py-1 text-sm">
                <span className="min-w-0 truncate">{value}</span>
                <button
                  type="button"
                  aria-label={`Remove ${value}`}
                  className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                  onClick={() => setValues(values.filter((v) => v !== value))}
                >
                  <X className="size-3.5" />
                </button>
              </Badge>
            ))}
            <input
              id={`${id}-value`}
              autoComplete="off"
              maxLength={50}
              placeholder={values.length > 0 ? "Add another" : "Type a value and press Enter"}
              value={typed}
              className="h-7 min-w-32 flex-1 bg-transparent px-2 text-sm text-field-text outline-none placeholder:text-field-placeholder"
              onChange={(e) => {
                setTyped(e.target.value)
                setValueError("")
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return
                e.preventDefault()
                add()
              }}
            />
          </div>
          <Button type="button" variant="outline" size="lg" className="h-11 shrink-0 px-4" onClick={add}>
            <Plus /> Add
          </Button>
        </div>
      </FormField>
    </FormDialog>
  )
}

export default Attributes
